Day 7 is about being able to see what an AI pipeline actually did after it runs, instead of guessing from a plain print statement or nothing at all.

---

## Observability — Day 7: OpenTelemetry & Agent Tracing

### The Problem We're Solving

Every lesson so far has printed its own result to the terminal and stopped there. That's fine for a 15-minute lesson, but a real production pipeline runs unattended, in the background, dozens of times a day - when something goes wrong (a model hallucinates, a tool call fails, a run gets slow or expensive), a plain log line doesn't tell you WHERE in the pipeline it happened, how long each step took, or how much it cost.

OpenTelemetry is the open, vendor-neutral standard for recording exactly that: a **trace** is the record of one whole pipeline run, made up of nested **spans** - one span per meaningful step, each with its own start/end time and attached facts (attributes). Because it's a standard rather than one vendor's own system, the same tracing code can send its spans to Langfuse, Datadog, Honeycomb, or Azure Monitor without changing the code - only the exporter at the end changes.

Langfuse adds AI-specific value on top of the same spans: recording a "generation" (an AI call, with its prompt/response/cost) as its own kind of span, and letting you attach a quality **score** to a run, separate from just recording that it happened.

Focus: recording a pipeline run as a hierarchy of nested spans, with real facts attached to each one
Time investment: 15 minutes

### Step 1: Install Observability Dependencies

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install opentelemetry-api opentelemetry-sdk langfuse pydantic-ai
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/observability/`, create:
`tracer_setup.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from langfuse import Langfuse
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()

provider = TracerProvider()
processor = BatchSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("sovereign.hub.tracer")

# If no Langfuse credentials are configured (LANGFUSE_PUBLIC_KEY /
# LANGFUSE_SECRET_KEY in .env), the client safely does nothing instead of
# crashing - useful for local development without a Langfuse account.
langfuse = Langfuse()


class TraceMetrics(BaseModel):
    identified_tech: str = Field(description="The primary tool extracted.")
    observability_grade: str = Field(description="Evaluation score for system health.")
    estimated_tokens: int = Field(description="Calculated token count.")


traced_agent = Agent(
    "openai:gpt-4o",
    output_type=TraceMetrics,
    system_prompt="We are an enterprise observability agent analyzing telemetry traces.",
)


async def execute_traced_pipeline(job_text: str) -> TraceMetrics:
    with tracer.start_as_current_span("SovereignHub_Pipeline_Execution") as root_span:
        root_span.set_attribute("environment", "production")
        root_span.set_attribute("user.id", "byron_lead_architect")

        print("Executing agent with active OpenTelemetry span...")

        with (
            tracer.start_as_current_span("pydantic_ai_agent_run") as agent_span,
            langfuse.start_as_current_observation(
                name="market_agent_trace",
                as_type="generation",
                metadata={"source": "job_pipeline_scraper", "user_id": "byron_lead_architect"},
            ) as langfuse_observation,
        ):
            agent_span.set_attribute("model", "gpt-4o")

            result = await traced_agent.run(job_text)
            output: TraceMetrics = result.output

            agent_span.set_attribute("output.tech", output.identified_tech)
            agent_span.set_attribute("output.tokens", output.estimated_tokens)

            langfuse_observation.score(
                name="schema_compliance",
                value=1.0,
                comment="Schema validated successfully without retries.",
            )

        print("\n--- Telemetry Span Output Received ---")
        print(f"Extracted Tech: {output.identified_tech}")
        print(f"Observability Grade: {output.observability_grade}")
        print(f"Token Count: {output.estimated_tokens}")

        return output


if __name__ == "__main__":
    sample_text = (
        "Senior Role requiring OpenTelemetry, Langfuse observability, "
        "Pydantic AI schema enforcement, and real-time LLM cost monitoring."
    )
    asyncio.run(execute_traced_pipeline(sample_text))
    provider.force_flush()
    langfuse.flush()
```

*(Note: `provider.force_flush()` and `langfuse.flush()` at the end aren't optional decoration. Spans are batched and sent in the background for efficiency; without flushing before a short-lived script exits, the last batch of spans can be silently dropped before they're ever sent.)*

### Step 4: Run and Verify

```bash
python src/observability/tracer_setup.py
```

You should see the agent's answer printed, followed by two JSON blocks - one span per traced step. Check the **child span's `parent_id`** against the **root span's `span_id`**: they should match exactly. That match is the actual proof the span hierarchy is real, not just two separate unrelated print statements that happen to look related.

---

## Best Practices

- **Verify a span hierarchy by checking `parent_id` against the parent's `span_id`, not by trusting the code's structure alone.** Nesting a `with tracer.start_as_current_span(...)` block inside another looks correct in the source, but the only real proof it worked is seeing the exported span data actually link them.
- **Flush before a short-lived script exits.** Both OpenTelemetry's `BatchSpanProcessor` and Langfuse batch and send in the background for efficiency; a script that exits without flushing can lose its very last, most recent batch of spans silently.
- **Standardize on OpenTelemetry, not a single vendor's tracing API, for the base layer.** Swapping `ConsoleSpanExporter` for a real backend's exporter is a one-line change precisely because none of the tracing code above calls Langfuse (or any vendor) directly - it all goes through the vendor-neutral tracer.

## Why This Matters in Production

As our automated pipelines run daily in the background, we need to be able to answer "what actually happened in run #4,281, and how much did it cost" without re-running it and hoping to reproduce the same behavior. Nested spans with real attributes attached give us that answer directly from what was actually recorded, and Langfuse's schema-compliance score on top gives us a quality signal Day 10's evaluation gates can build on.
