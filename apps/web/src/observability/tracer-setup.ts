import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";

// Sets up a standard OpenTelemetry tracer, the same core idea as Day 7's
// Python lesson. ConsoleSpanExporter prints every finished span straight to
// the terminal - fine for this lesson, but in a real deployment this
// exporter would be swapped for one that sends spans elsewhere, WITHOUT
// changing any of the tracing code below. LangfuseSpanProcessor is added
// alongside it: Langfuse's JS SDK works by reading the same OpenTelemetry
// spans, not by using its own separate tracing system, so both processors
// can watch the same spans at once.
const provider = new NodeTracerProvider({
  spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter()), new LangfuseSpanProcessor()],
});
provider.register();

const tracer = trace.getTracer("sovereign.hub.tracer");

const TraceMetricsSchema = z.object({
  identifiedTech: z.string().describe("The primary tool extracted."),
  observabilityGrade: z.string().describe("Evaluation score for system health."),
  estimatedTokens: z.number().describe("Calculated token count."),
});

// Wraps one real AI call in a root span, with a nested child span around
// the AI call itself. Opening a second span INSIDE the first one's active
// context makes it a CHILD, not a sibling - so a trace viewer can show
// "this AI call happened as part of this pipeline run," not just two
// unrelated events.
async function executeTracedPipeline(jobText: string) {
  return tracer.startActiveSpan("SovereignHub_Pipeline_Execution", async (rootSpan) => {
    rootSpan.setAttribute("environment", "production");
    rootSpan.setAttribute("user.id", "byron_lead_architect");

    console.log("Executing agent with active OpenTelemetry span...");

    // startActiveObservation is Langfuse's own function-scoped span helper,
    // built directly on OpenTelemetry - the observation it creates is a
    // genuine OTel span underneath, which is what lets it nest correctly
    // inside rootSpan's active context above.
    const output = await startActiveObservation(
      "market_agent_trace",
      async (observation) => {
        observation.update({
          input: jobText,
          metadata: { source: "job_pipeline_scraper", userId: "byron_lead_architect" },
        });

        const { object } = await generateObject({
          model: openai("gpt-4o"),
          schema: TraceMetricsSchema,
          system: "We are an enterprise observability agent analyzing telemetry traces.",
          prompt: jobText,
        });

        // Recording these on the span (not just printing them) is what
        // makes them show up as structured, filterable fields in a real
        // trace viewer, instead of unstructured text in a log.
        observation.update({ output: object });

        return object;
      },
      { asType: "generation" },
    );

    console.log("\n--- Telemetry Span Output Received ---");
    console.log(`Extracted Tech: ${output.identifiedTech}`);
    console.log(`Observability Grade: ${output.observabilityGrade}`);
    console.log(`Token Count: ${output.estimatedTokens}`);

    rootSpan.end();
    return output;
  });
}

async function main() {
  const sampleText =
    "Senior Role requiring OpenTelemetry, Langfuse observability, " +
    "Vercel AI SDK schema enforcement, and real-time LLM cost monitoring.";

  await executeTracedPipeline(sampleText);

  // Spans are batched and sent in the background; flushing here before the
  // script exits is what guarantees the console exporter actually prints
  // every recorded span instead of losing the last batch.
  await provider.forceFlush();
  await provider.shutdown();
}

main().catch(console.error);
