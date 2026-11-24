import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Dynamic agent tool fallback & secondary SLA routing - Day 50 TS port.
 *
 * A resilient agent monitors round-trip latency, catches timeouts, and
 * dynamically falls back to an alternative tool provider without
 * interrupting the user's request. TS has no asyncio.wait_for equivalent
 * built in, so the timeout race is built with Promise.race against a
 * rejecting timer instead.
 */

async function primaryMarketDataApi(): Promise<number> {
  // Simulates a slow upstream service that exceeds our SLA.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return 4.25;
}

async function secondaryCacheDataApi(): Promise<number> {
  // Fast fallback snapshot cache.
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 4.2;
}

async function fastPrimaryMarketDataApi(): Promise<number> {
  // Simulates a primary that IS within SLA, for the healthy-path scenario.
  await new Promise((resolve) => setTimeout(resolve, 100));
  return 4.25;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TimeoutError")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

const fetchBenchmarkValuation = tool({
  description: "Fetches benchmark asset yields with automatic timeout fallback.",
  inputSchema: z.object({ isin: z.string() }),
  execute: async ({ isin }) => {
    const startTime = performance.now();
    const slaTimeoutMs = 500; // Strict 500ms latency ceiling

    try {
      const yieldRate = await withTimeout(primaryMarketDataApi(), slaTimeoutMs);
      const elapsed = performance.now() - startTime;
      return `Provider: PRIMARY_LIVE | Yield: ${yieldRate}% | Latency: ${elapsed.toFixed(1)}ms`;
    } catch (err) {
      console.log(
        `\n[ALERT]: Primary provider for ${isin} exceeded ${slaTimeoutMs}ms SLA (${(err as Error).message}). Routing to fallback.`,
      );
      const yieldRate = await secondaryCacheDataApi();
      const elapsed = performance.now() - startTime;
      return `Provider: SECONDARY_FALLBACK | Yield: ${yieldRate}% | Latency: ${elapsed.toFixed(1)}ms`;
    }
  },
});

const ValuationReportSchema = z.object({
  benchmarkId: z.string(),
  valuationRate: z.number(),
  sourceUsed: z.string().describe("Specifies primary or secondary fallback data provider."),
  executionLatencyMs: z.number(),
});

async function main(): Promise<void> {
  console.log("--- Test 1: Resilient Tool Call with SLA Fallback Router (Primary Too Slow) ---");
  const query = "Evaluate current yield rate for UK Gilt asset GB00BM8Z2S21.";
  console.log(`Request: ${query}`);

  const start = performance.now();
  const { toolResults } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an autonomous portfolio risk manager. Calculate the valuation yield for the requested benchmark " +
      "asset using our data tools.",
    tools: { fetchBenchmarkValuation },
    stopWhen: stepCountIs(3),
    prompt: query,
  });
  const totalElapsed = performance.now() - start;

  // The model's final text summarizes the answer in natural language and
  // drops the tool's own precise return string (provider name, exact
  // latency) - extract structure from the RAW tool output instead of the
  // model's paraphrase of it, otherwise sourceUsed/executionLatencyMs
  // silently default to wrong values.
  const rawToolOutput = toolResults.map((r) => r.output).join("\n");
  const { object: report } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: ValuationReportSchema,
    prompt:
      `Extract the structured valuation report for benchmark ISIN GB00BM8Z2S21 from this raw tool output ` +
      `(preserve the exact provider name and latency figure, don't paraphrase):\n${rawToolOutput}`,
  });

  console.log("\n=== Final Validated Report ===");
  console.log(`Benchmark: ${report.benchmarkId}`);
  console.log(`Rate: ${report.valuationRate}%`);
  console.log(`Data Source: ${report.sourceUsed}`);
  console.log(`Execution Latency: ${report.executionLatencyMs.toFixed(1)} ms`);

  // Real proof the fallback GENUINELY happened: check the tool's own
  // reported latency, not the total agent wall-clock time (which also
  // includes unrelated LLM round-trip overhead) - same lesson learned
  // in the Python port.
  console.log(
    `\n[VERIFICATION] Total agent wall-clock time: ${totalElapsed.toFixed(0)}ms (includes LLM round-trip overhead, not just tool latency)`,
  );
  if (report.executionLatencyMs >= 1200) {
    throw new Error(
      `BUG: tool's own reported latency (${report.executionLatencyMs.toFixed(1)}ms) suggests the SLA timeout never actually cut off the slow primary call.`,
    );
  }
  console.log(
    `[VERIFIED] Tool's own reported latency (${report.executionLatencyMs.toFixed(1)}ms) confirms the SLA timeout genuinely fired before the primary's full 1.5s delay.`,
  );

  console.log("\n--- Test 2: Primary Within SLA (No Fallback Should Occur) ---");
  const startTime = performance.now();
  try {
    const yieldRate = await withTimeout(fastPrimaryMarketDataApi(), 500);
    const elapsed = performance.now() - startTime;
    console.log(
      `[VERIFIED] Provider: PRIMARY_LIVE | Yield: ${yieldRate}% | Latency: ${elapsed.toFixed(1)}ms (no fallback triggered)`,
    );
  } catch {
    console.log("BUG: fallback triggered even though the primary was within the SLA window.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
