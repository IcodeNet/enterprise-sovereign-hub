This is Day 17's TypeScript side - and it surfaced a genuinely bigger finding than the Python lesson's naming trap: an SDK option that looks like real auto-instrumentation but currently does nothing at all.

---

## Observability — Day 17 (TS Port): Logfire & Distributed Tracing

### The Problem We're Solving

Same problem as the Python lesson: see exactly what an AI call did, automatically, without hand-writing tracing code around every call site.

**There is no official Logfire package for TypeScript/Node** - only Python. The natural-seeming TS equivalent looked like the Vercel AI SDK's own `telemetry`/`experimental_telemetry` option, which promises to auto-emit OpenTelemetry spans for a `generateObject`/`generateText` call - directly analogous to Python's `instrument_pydantic_ai()`.

**The real finding: it doesn't work, at all, in this version.** Passing `experimental_telemetry: { isEnabled: true }` compiles cleanly (the TypeScript types genuinely include the option) and runs with no error - but produces ZERO spans. Grepping the AI SDK's own bundled runtime code (`node_modules/ai/dist/index.js`, `ai@7.0.118`) for any reference to `@opentelemetry/api`, `getTracer`, or `startSpan` turns up nothing at all - the option exists in the type signature but the actual OpenTelemetry integration it promises isn't wired into this version's shipped code. This is a SILENT no-op, not a loud failure - which makes it the more dangerous version of Day 17's Python-side naming trap.

Focus: the same automatic-tracing goal, with the AI SDK's own telemetry option found to be non-functional and a manual span wrap used instead
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| setting up tracing (`logfire.configure(service_name="sovereign-intelligence-hub")`) | setting up tracing (`new NodeTracerProvider({ resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "sovereign-intelligence-hub" }) })`) |
| auto-tracing the agent (`logfire.instrument_pydantic_ai()`) | printing spans to the console (`new BatchSpanProcessor(new ConsoleSpanExporter())` + `provider.register()`) |
| opening the outer span (`with logfire.span("SovereignHub.AgentRun", query=query) as span:`) | opening the outer span (`tracer.startActiveSpan("SovereignHub.AgentRun", async (rootSpan) => {...})`) |
| tagging the span with the result (`span.set_attribute("output.tool_name", data.tool_name)`) | tagging the span with the result (`rootSpan.setAttribute("output.tool_name", object.toolName)`) |
| the expected answer shape (`class ObservedMetrics(BaseModel)`) | the expected answer shape (`const ObservedMetricsSchema = z.object({...})`) |

### Step 1: No New Dependencies

This lesson uses `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, and `@opentelemetry/sdk-trace-base`, already installed from Day 7.

### Step 2: Create the Source File

Inside `apps/web/src/observability/`, create:
`logfire-tracer.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { z } from "zod";

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
```

### Step 4: Run and Verify - the Real Bug the AI SDK's Own Option Had

**First attempt, relying on `experimental_telemetry` alone (no manual span):**
```bash
npx tsx src/observability/logfire-tracer.ts
```
```
Executing agent with active OpenTelemetry tracing (AI SDK telemetry)...
--- Telemetry Trace Recorded ---
Tool Name: AI SDK Agent Workflow Monitor
Health Status: All systems operational
Span Record ID: 64829ac4-f3b1-44d7-a8b2-787ac45a558b
```
The AI call succeeded and returned correctly-typed output - but the `ConsoleSpanExporter`, which prints every span it receives, printed NOTHING. No error. No warning. Just silence, which is exactly what makes this dangerous: a developer trusting the option's name alone would reasonably believe tracing was active.

**Fixed, using an explicit manual span (same pattern Day 7 already used):**
```
Executing agent with active OpenTelemetry tracing...
--- Telemetry Trace Recorded ---
Tool Name: AI SDK Agent Workflow Execution
Health Status: All systems operational
Span Record ID: 683a7f54-812a-4b0a-b5c1-07f6064daf0d
{
  resource: { attributes: { 'service.name': 'sovereign-intelligence-hub' } },
  traceId: '5823426283cee6b173870511256da974',
  name: 'SovereignHub.AgentRun',
  attributes: {
    'output.tool_name': 'AI SDK Agent Workflow Execution',
    'output.health': 'All systems operational'
  },
  status: { code: 0 },
  ...
}
```
A real span, with the correct service name and recorded attributes, printed exactly as expected.

---

## Best Practices

- **A type signature accepting an option is not proof the option does anything at runtime.** `experimental_telemetry` compiled, ran, and returned correct data with zero indication it wasn't tracing anything - the only way to catch this was checking whether the exporter actually printed a span, not whether the script "worked."
- **When an SDK's own auto-instrumentation option is suspect, grep the SDK's OWN bundled code for the underlying library it claims to use** (here: `@opentelemetry/api`, `getTracer`, `startSpan` inside `node_modules/ai/dist/index.js`) - this is a fast, definitive way to confirm whether an integration is real or vestigial, far faster than trial and error.
- **A silent no-op is more dangerous than a loud error.** Day 17's Python lesson found a wrong-but-similar-sounding function name; this TS finding is a level worse - the RIGHT-sounding, correctly-typed option, doing nothing, with no signal at all that anything is missing.

## Why This Matters in Production

Never trust that a documented, type-safe option is functionally wired up without checking the actual output it's supposed to produce. This finding - a correctly-named, correctly-typed telemetry option that silently does nothing in this SDK version - is exactly the kind of gap that would let a real production system run completely untraced for months, with every dashboard query for "where are this agent's spans" coming back empty and nobody able to say why, because nothing ever threw an error to point at.
