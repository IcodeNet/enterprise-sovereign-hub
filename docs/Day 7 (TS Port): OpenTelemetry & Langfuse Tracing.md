This is Day 7's TypeScript side: the same nested-span tracing as the Python lesson, using OpenTelemetry's Node SDK and Langfuse's current OTel-native JS SDK.

---

## OpenTelemetry (TypeScript) — Day 7 (TS Port): Agent Tracing

### The Problem We're Solving

Same problem as the Python lesson: a pipeline that only prints its own result gives no way to see WHERE a slow, expensive, or wrong run actually happened. OpenTelemetry solves this the same way regardless of language - a trace made of nested spans, exportable to any vendor without changing the tracing code itself.

Langfuse's current JS/TS SDK generation (the scoped `@langfuse/*` packages) is built directly ON TOP of OpenTelemetry, not as a separate system next to it - a Langfuse "observation" IS a real OpenTelemetry span underneath, which is what lets it nest correctly inside spans created with the plain OpenTelemetry API.

Focus: the same nested-span tracing, built with `@opentelemetry/sdk-trace-node` and `@langfuse/tracing`
Time investment: 15 minutes (assuming Day 7's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| setting up tracing (`TracerProvider()` + `provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))`) | setting up tracing (`new NodeTracerProvider({ spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter()), new LangfuseSpanProcessor()] })`) |
| opening the root span (`with tracer.start_as_current_span("SovereignHub_Pipeline_Execution") as root_span`) | opening the root span (`tracer.startActiveSpan("SovereignHub_Pipeline_Execution", async (rootSpan) => ...)`) |
| attaching facts to a span (`root_span.set_attribute("user.id", ...)`) | attaching facts to a span (`rootSpan.setAttribute("user.id", ...)`) |
| the Langfuse observation (`langfuse.start_as_current_observation(name="market_agent_trace", as_type="generation")`) | the Langfuse observation (`startActiveObservation("market_agent_trace", ..., { asType: "generation" })`) |
| the traced AI call (`await traced_agent.run(job_text)` returning `TraceMetrics`) | the traced AI call (`await generateObject({ ..., schema: TraceMetricsSchema })`) |
| sending spans before exit (`provider.force_flush()` + `langfuse.flush()`) | sending spans before exit (`await provider.forceFlush()` + `await provider.shutdown()`) |

### Step 1: Install the Packages

Inside `apps/web`:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base \
  @langfuse/tracing @langfuse/otel @opentelemetry/exporter-trace-otlp-http --legacy-peer-deps
```

*(Note: `@opentelemetry/exporter-trace-otlp-http` isn't optional here, even though nothing in the code below imports it directly - `LangfuseSpanProcessor` needs it internally to actually attempt sending spans to Langfuse's servers. Leaving it out produces a confusing `ERR_MODULE_NOT_FOUND` the first time you actually run the script, not at install time.)*

### Step 2: Create the Source File

Inside `apps/web/src/observability/`, create:
`tracer-setup.ts`

### Step 3: Add the Source Code

```typescript
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

async function executeTracedPipeline(jobText: string) {
  return tracer.startActiveSpan("SovereignHub_Pipeline_Execution", async (rootSpan) => {
    rootSpan.setAttribute("environment", "production");
    rootSpan.setAttribute("user.id", "byron_lead_architect");

    console.log("Executing agent with active OpenTelemetry span...");

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

  await provider.forceFlush();
  await provider.shutdown();
}

main().catch(console.error);
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/observability/tracer-setup.ts
```

You should see the AI's answer printed, then two exported span objects. Check the child span's `parentSpanContext.spanId` against the root span's own `id` - they should match exactly, the same real proof of nesting used in the Python lesson.

*(Note: you'll also see a `401 Unauthorized` printed at the very end. That's expected here - it's `LangfuseSpanProcessor` genuinely trying to upload the trace to Langfuse's servers and correctly failing because no `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are configured in `.env`. It's evidence the wiring is real, not a sign anything is broken: with real credentials configured, the exact same code would succeed.)*

---

## Best Practices

- **A missing transitive dependency for an OTel exporter fails at RUN time, not at install time.** `npm install` succeeded without `@opentelemetry/exporter-trace-otlp-http` in the package list; the error only appeared the first time the code path that needed it actually executed. Running the script for real, not just installing and type-checking, is what caught this.
- **Verify the span hierarchy from the actual exported data, the same discipline as the Python lesson.** `parentSpanContext.spanId` matching the parent's `id` in the printed span objects is the real evidence; the source code merely nesting one span inside another's callback is not proof on its own.
- **A vendor auth failure at the very end of a successful run is a different, less serious problem than a crash mid-run.** The 401 here happens strictly after all of our own tracing and the real AI call completed successfully - recognizing that distinction (and reading the actual error message) avoids mistaking a working feature for a broken one.

## Why This Matters in Production

The same daily-pipeline visibility from Day 7's Python lesson now exists identically on the TypeScript side: nested spans with real attributes, exportable to any OpenTelemetry-compatible backend without touching the tracing code, and Langfuse able to layer AI-specific value (generations, scores) directly on top. Whichever side of the stack runs a given pipeline, we can answer "what actually happened" the same way.
