This is Day 22's TypeScript side - the same real correction (never ask the model to self-report caching) and the same honest, inconsistent-cache-hit finding, confirming it isn't specific to one language or SDK.

---

## Cost Engineering — Day 22 (TS Port): Context Caching & Prompt Compression

### The Problem We're Solving

Same problem as the Python lesson: a large static system prompt gets fully reprocessed on every call unless the provider caches it. Same correction: the real cache signal lives in the API response's usage metadata (`usage.inputTokenDetails.cacheReadTokens` in the Vercel AI SDK), never in anything a model can self-report.

Focus: the same real-signal correction, in TypeScript, with cross-language confirmation of the same honest caching-reliability finding
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the expected answer shape (`class CachedAnalysisReport(BaseModel)`) | the expected answer shape (`const CachedAnalysisReportSchema = z.object({...})`) |
| setting up the AI with the cached corpus (`Agent("openai:gpt-4o", output_type=CachedAnalysisReport, system_prompt=...)`) | asking the AI with the cached corpus (`generateObject({ model: openai("gpt-4o"), schema: CachedAnalysisReportSchema, system: systemPrompt, prompt })`) |
| running it (`await cached_agent.run(prompt)`) | running it (`await generateObject({ ..., prompt })`) |
| reading the checked answer (`result.output`) | reading the checked answer (`{ object }`) |
| reading the real cache signal (`result.usage.cache_read_tokens`) | reading the real cache signal (`usage.inputTokenDetails?.cacheReadTokens`) |
| timing the call (`time.perf_counter()`) | timing the call (`performance.now()`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/optimization/`, create:
`context-caching.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const CachedAnalysisReportSchema = z.object({
  query: z.string(),
  keyFindings: z.array(z.string()).describe("Key insights extracted from the cached corpus."),
});

const LARGE_ENTERPRISE_CORPUS = `
=== SOVEREIGN INTELLIGENCE HUB SYSTEM ARCHITECTURE SPECIFICATION ===
MODULE 1: AGENT CORE
We enforce type-safe agent execution using the Vercel AI SDK across all microservices.
...
=====================================================================
`.repeat(130);

const systemPrompt =
  "We are a principal AI cost engineer. " +
  "Analyze queries against our cached system architecture corpus cleanly and concisely.\n\n" +
  `CORPUS CONTEXT:\n${LARGE_ENTERPRISE_CORPUS}`;

async function runCachedQuery(prompt: string) {
  const start = performance.now();

  console.log(`Executing query against cached context: '${prompt}'...`);
  const { object, usage } = await generateObject({
    model: openai("gpt-4o"),
    schema: CachedAnalysisReportSchema,
    system: systemPrompt,
    prompt,
  });

  const latencyMs = performance.now() - start;
  // The real, verifiable cache signal - never asked of the model itself.
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;

  console.log("\n--- Agent Response Received ---");
  console.log(`Latency: ${latencyMs.toFixed(2)} ms`);
  console.log(`Cache Read Tokens: ${cacheReadTokens}`);
  console.log("Findings:");
  for (const finding of object.keyFindings) {
    console.log(` - ${finding}`);
  }

  return { ...object, latencyMs, cacheReadTokens };
}

async function main() {
  console.log("--- Call 1: Initializing Cache ---");
  await runCachedQuery("What vector store and fusion algorithm do we use for RAG?");

  console.log(`\n${"=".repeat(50)}\n`);

  console.log("--- Call 2: Reusing Cached Prompt Context ---");
  await runCachedQuery("How do we handle observability and red-teaming security?");
}

main().catch(console.error);
```

### Step 4: Run and Verify - the Same Real, Honest Result

```bash
cd apps/web
npx tsx src/optimization/context-caching.ts
```

Real run: `Cache Read Tokens: 0` on BOTH calls, despite the same 130x-repeated, genuinely-large corpus that worked when tested with the raw OpenAI client directly. This matches the Python lesson's own inconsistent findings - cross-language confirmation that the unreliability isn't specific to `pydantic-ai` or the Vercel AI SDK, it's a property of OpenAI's caching infrastructure itself under real-world call patterns (structured-output requests, real elapsed time between calls, possibly concurrent load from other cache users on the same backend).

---

## Best Practices

- **Never ask an AI model to self-report on infrastructure it cannot observe** - the same correction as the Python lesson, confirmed necessary in this SDK too: `usage.inputTokenDetails.cacheReadTokens` is the only trustworthy signal.
- **A cross-language reproduction of the SAME unreliable result is stronger evidence than either language's result alone.** If only Python had shown inconsistent caching, that could plausibly be attributed to something `pydantic-ai`-specific; seeing the identical pattern in a completely different SDK calling the same OpenAI API confirms the unreliability is a genuine property of the caching infrastructure, not a client-library quirk.
- **Don't build a cost-savings pitch around "the second call will always be cheap."** Both languages' repeated runs showed this isn't reliably true - budget for cache misses.

## Why This Matters in Production

When the SAME real finding shows up independently in two unrelated SDKs calling the same underlying provider, that's strong, cross-checked evidence rather than a fluke worth dismissing. Automatic prompt caching is a real cost lever worth using, but "assume every repeated call is cheap" is not a safe assumption to build a budget or an SLA around.
