import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Async token bucket rate limiter with exponential backoff - Day 29 TS port.
 *
 * Same throttling contract as the Python side: a fixed-capacity bucket
 * refills at a fixed rate, and a caller that finds it empty backs off with
 * exponential + jitter delay instead of firing an unthrottled burst.
 */

const ThrottledAgentResultSchema = z.object({
  completionText: z.string(),
});

class AsyncTokenBucket {
  private tokens: number;
  private lastUpdate: number;
  /**
   * A single in-process mutex substitutes for Python's asyncio.Lock: JS
   * has no native async lock, so this promise chain serializes acquire()
   * calls the same way - only one call reads/writes `tokens` at a time,
   * even though many are awaited concurrently via Promise.all.
   */
  private mutex: Promise<void> = Promise.resolve();

  constructor(
    private readonly refillRatePerSec: number,
    private readonly maxCapacity: number,
  ) {
    this.tokens = maxCapacity;
    this.lastUpdate = performance.now() / 1000;
  }

  async acquire(tokensNeeded = 1.0, maxRetries = 5): Promise<number> {
    const startWait = performance.now() / 1000;
    let attempt = 0;

    while (true) {
      const waited = await this.tryAcquireOnce(tokensNeeded, startWait);
      if (waited !== null) return waited;

      attempt += 1;
      if (attempt > maxRetries) {
        throw new Error("Rate limit exceeded: Token bucket exhausted.");
      }

      const baseDelay = 0.5 * 2 ** (attempt - 1);
      const jitter = 0.1 + Math.random() * 0.3;
      const sleepDuration = baseDelay + jitter;

      console.log(
        ` [RATE LIMIT HIT] Bucket empty. Backing off for ${sleepDuration.toFixed(2)}s (Attempt ${attempt})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, sleepDuration * 1000));
    }
  }

  private async tryAcquireOnce(tokensNeeded: number, startWait: number): Promise<number | null> {
    const previous = this.mutex;
    const { promise: nextMutex, resolve: release } = Promise.withResolvers<void>();
    this.mutex = nextMutex;
    await previous;

    try {
      const now = performance.now() / 1000;
      const elapsed = now - this.lastUpdate;
      this.lastUpdate = now;

      this.tokens = Math.min(this.maxCapacity, this.tokens + elapsed * this.refillRatePerSec);

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        const totalWaited = performance.now() / 1000 - startWait;
        return Math.round(totalWaited * 1000) / 1000;
      }
      return null;
    } finally {
      release();
    }
  }
}

async function dispatchRequest(queryId: number, bucket: AsyncTokenBucket) {
  const waitTime = await bucket.acquire(1.0);

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: ThrottledAgentResultSchema,
    system: "We are an enterprise agent returning brief, type-safe summaries.",
    prompt: `Provide a one-line status report for microservice worker #${queryId}.`,
  });

  console.log(
    `Worker #${queryId} completed (Waited: ${waitTime}s) -> ${object.completionText.slice(0, 60)}...`,
  );
  return { queryId, completionText: object.completionText, waitedSeconds: waitTime };
}

async function runBurstBenchmark(): Promise<void> {
  // Max burst capacity of 3 requests, refilling at 2 requests/sec - same
  // configuration as the Python side, for a directly comparable result.
  const bucket = new AsyncTokenBucket(2.0, 3.0);

  console.log("Step 1: Firing a burst of 8 concurrent requests through token bucket...");
  const tasks = Array.from({ length: 8 }, (_, i) => dispatchRequest(i + 1, bucket));

  const results = await Promise.all(tasks);
  console.log("\n--- Burst Execution Completed Successfully ---");
  console.log(`Total Requests Processed: ${results.length}`);
  for (const r of [...results].toSorted((a, b) => a.queryId - b.queryId)) {
    console.log(`  Worker #${r.queryId}: waited ${r.waitedSeconds}s`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBurstBenchmark().catch(console.error);
}
