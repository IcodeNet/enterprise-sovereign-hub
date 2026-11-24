import asyncio

from dotenv import load_dotenv
from langfuse import Langfuse
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()

# Sets up a standard OpenTelemetry tracer. ConsoleSpanExporter prints every
# finished span straight to the terminal - fine for this lesson and for
# local debugging, but in a real deployment this exporter would be swapped
# for one that sends spans to Langfuse, Datadog, Honeycomb, or Azure Monitor
# instead, WITHOUT changing any of the tracing code below. That swap-ability
# is the entire point of standardizing on OpenTelemetry rather than a single
# vendor's own tracing API.
provider = TracerProvider()
processor = BatchSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("sovereign.hub.tracer")

# Langfuse itself is now built directly on OpenTelemetry (rather than its
# own separate tracing system), so a Langfuse client can layer richer,
# AI-specific observability - like scoring an answer's quality - directly
# on top of the same spans OpenTelemetry is already recording. If no
# Langfuse credentials are configured (LANGFUSE_PUBLIC_KEY /
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


# Wraps one real AI call in a root span, with a nested child span around the
# AI call itself. This is what "span hierarchy" means in practice: opening
# tracer.start_as_current_span(...) a second time, inside the first one's
# `with` block, makes the second span a CHILD of the first, not a sibling -
# so a trace viewer can show "this AI call happened as part of this
# pipeline run", not just two unrelated events.
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

            # Recording these as span ATTRIBUTES (not just printing them) is
            # what makes them show up as structured, filterable fields in a
            # real trace viewer - e.g. "show me every run where
            # output.tokens > 2000" - instead of unstructured text in a log.
            agent_span.set_attribute("output.tech", output.identified_tech)
            agent_span.set_attribute("output.tokens", output.estimated_tokens)

            # Langfuse's score is a separate signal layered on top of the
            # same observation: not "what happened" (that's the span), but
            # "was it good" - a judgement a later step (or Day 10's
            # evaluation suite) can use as a quality gate.
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
    # Spans are batched and sent in the background; flushing here before
    # the script exits is what guarantees the console exporter actually
    # prints every recorded span instead of losing the last batch.
    provider.force_flush()
    langfuse.flush()
