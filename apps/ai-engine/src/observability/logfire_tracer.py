import asyncio

import logfire
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()

# Logfire integrates with standard OpenTelemetry, the same tracing standard
# Day 7 used directly - this lesson gets the same nested-span tracing with
# far less manual setup, since logfire.instrument_pydantic_ai() wires up
# pydantic-ai's own internal spans automatically.
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
    # An explicit outer span wraps the whole agent run; pydantic-ai's own
    # internal spans (model request, tool calls, validation retries) nest
    # underneath it automatically once instrument_pydantic_ai() is active -
    # the same parent/child nesting Day 7 built by hand, given here for free.
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
