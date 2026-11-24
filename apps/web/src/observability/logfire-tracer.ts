import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { z } from "zod";

// There is no official Logfire package for TypeScript/Node (only Python) -
// so this port uses the same underlying standard Logfire itself is built
// on: plain OpenTelemetry, the same NodeTracerProvider setup Day 7 already
// used.
//
// REAL FINDING: the Vercel AI SDK's own `telemetry`/`experimental_telemetry`
// option (the thing that looked like the direct TS equivalent of Python's
// logfire.instrument_pydantic_ai() auto-instrumentation) is present in this
// version's TYPE signature but does NOT actually call into OpenTelemetry at
// runtime - grepping the SDK's own bundled code turns up zero references to
// @opentelemetry/api or any tracer/span creation at all. Passing
// `experimental_telemetry: { isEnabled: true }` compiles and runs with no
// error, but produces zero spans - a silent no-op, not a loud failure. The
// real, working equivalent is the same explicit manual span wrapping Day 7
// already used.
const tracer = trace.getTracer("sovereign.hub.tracer");
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "sovereign-intelligence-hub" }),
  spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter())],
});
provider.register();

const ObservedMetricsSchema = z.object({
  toolName: z.string().describe("Name of the tool executed."),
  executionHealth: z.string().describe("Health status of the agent run."),
  spanId: z.string().describe("Unique tracing span ID."),
});

async function runTracedExecution(query: string) {
  return tracer.startActiveSpan("SovereignHub.AgentRun", async (rootSpan) => {
    console.log("Executing agent with active OpenTelemetry tracing...");

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: ObservedMetricsSchema,
      system: "We are an enterprise observability agent capturing structured telemetry spans.",
      prompt: query,
    });

    rootSpan.setAttribute("output.tool_name", object.toolName);
    rootSpan.setAttribute("output.health", object.executionHealth);

    console.log("\n--- Telemetry Trace Recorded ---");
    console.log(`Tool Name: ${object.toolName}`);
    console.log(`Health Status: ${object.executionHealth}`);
    console.log(`Span Record ID: ${object.spanId}`);

    rootSpan.end();
    return object;
  });
}

async function main() {
  const sampleQuery = "Capture real-time execution spans for our AI SDK agent workflow.";
  await runTracedExecution(sampleQuery);

  // Spans are batched and sent in the background; flushing here before the
  // process exits is what guarantees the console exporter actually prints
  // every recorded span instead of losing the last batch.
  await provider.forceFlush();
  await provider.shutdown();
}

main().catch(console.error);
