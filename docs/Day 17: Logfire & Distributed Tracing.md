Day 17 is about seeing exactly what an AI agent did - every prompt, every tool call, every retry - without writing manual logging code for each one.

---

## Observability — Day 17: Logfire & Distributed Tracing

### The Problem We're Solving

An agentic workflow can fail silently in ways a simple `print()` statement never catches: a retry loop that quietly runs three times before succeeding, a tool call that took 4 seconds when it should take 200ms, a validation failure that got auto-corrected so smoothly nothing in the console hints at it. Day 7 built OpenTelemetry tracing by hand - explicit spans, explicit attributes. **Logfire** does the same underlying job, but auto-instruments Pydantic AI's own internals: once switched on, every `Agent.run()` call, every tool invocation, and every validation retry gets its own nested span automatically, with zero manual span code inside the agent logic itself.

Focus: instrumenting Pydantic AI agents with Logfire for automatic, real-time span visualization
Time investment: 15 minutes

### Step 1: Install Logfire

```bash
pip install logfire pydantic-ai
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/observability/`, create:
`logfire_tracer.py`

### Step 3: Add the Source Code

```python
import asyncio

import logfire
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()

logfire.configure(
    send_to_logfire=False,  # Set to True when connecting to a real cloud Logfire dashboard.
    service_name="sovereign-intelligence-hub",
)


class ObservedMetrics(BaseModel):
    tool_name: str = Field(description="Name of the tool executed.")
    execution_health: str = Field(description="Health status of the agent run.")
    span_id: str = Field(description="Unique tracing span ID.")


tracer_agent = Agent(
    "openai:gpt-4o",
    output_type=ObservedMetrics,
    system_prompt="We are an enterprise observability agent capturing structured telemetry spans.",
)

# instrument_pydantic_ai() - NOT instrument_pydantic() - is what actually
# wires up tracing for Agent.run() calls: instrument_pydantic() instruments
# Pydantic's own VALIDATION internals (a different, unrelated concern), and
# calling it here would silently produce no agent-level spans at all.
logfire.instrument_pydantic_ai()


async def run_traced_execution(query: str) -> ObservedMetrics:
    with logfire.span("SovereignHub.AgentRun", query=query) as span:
        print("Executing agent with active Logfire OpenTelemetry tracing...")

        result = await tracer_agent.run(query)
        data: ObservedMetrics = result.output

        span.set_attribute("output.tool_name", data.tool_name)
        span.set_attribute("output.health", data.execution_health)

        print("\n--- Telemetry Trace Recorded ---")
        print(f"Tool Name: {data.tool_name}")
        print(f"Health Status: {data.execution_health}")
        print(f"Span Record ID: {data.span_id}")
        return data


if __name__ == "__main__":
    sample_query = "Capture real-time execution spans for our Pydantic AI agent workflow."
    asyncio.run(run_traced_execution(sample_query))
```

### Step 4: Run and Verify - the Real Bug in the Initial Example

An earlier example called `logfire.instrument_pydantic()`. That call exists, compiles, and runs with no error - but it instruments Pydantic's own VALIDATION plugin internals, a completely different, unrelated concern. Calling it here would leave `Agent.run()` completely untraced with no error or warning telling you so.

Proof, side by side:

**With the wrong call (`instrument_pydantic()`):**
```
08:41:57.058 SovereignHub.AgentRun
done
```
Only the manually-written outer span shows. No child spans at all - `Agent.run()`'s internal model calls and tool calls are completely invisible.

**With the correct call (`instrument_pydantic_ai()`):**
```bash
python src/observability/logfire_tracer.py
```
```
08:41:37.760 SovereignHub.AgentRun
Executing agent with active Logfire OpenTelemetry tracing...
08:41:37.771   tracer_agent run
08:41:37.792     chat gpt-4o
```
The full nested span tree appears automatically - `SovereignHub.AgentRun` (this lesson's manual span) → `tracer_agent run` (pydantic-ai's own span) → `chat gpt-4o` (the actual model call), all for free once the correct instrumentation call is in place.

---

## Best Practices

- **A wrong-but-similarly-named instrumentation call is a genuinely dangerous failure mode: it produces no error, just silently less tracing than expected.** `instrument_pydantic()` vs `instrument_pydantic_ai()` differ by exactly the "_ai" suffix and instrument two completely different concerns - always verify which spans actually appear by running the code, don't assume a call "probably" wires up what its name suggests.
- **Compare the WITH and WITHOUT output side by side when validating an instrumentation call.** A single successful run with a plausible-looking span tree can look right even when a whole layer of expected spans is silently missing - the comparison is what actually proves the fix.
- **Auto-instrumentation (Logfire's `instrument_pydantic_ai()`) and manual spans (this lesson's `logfire.span(...)` wrapper) compose cleanly together** - the manual span becomes the parent, the auto-instrumented spans nest inside it, giving you both a business-level view (this specific pipeline run) and a technical-level view (every underlying model/tool call) in one trace.

## Why This Matters in Production

A wrong instrumentation call that produces zero errors and just quietly traces less than expected is exactly the kind of bug that survives code review and a first successful test run - it only shows up when someone actually goes looking for a specific span in a dashboard and can't find it. Verifying tracing setup means checking the ACTUAL span tree produced, not just that the script ran without an exception.
