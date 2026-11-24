import crypto from "node:crypto";

/**
 * Deterministic hash-based sampling for human review queues - Day 55 TS port.
 *
 * Hashing a stable identifier (e.g. a conversation ID) into a fixed-width
 * space and comparing against a threshold means the SAME identifier
 * always produces the SAME sampling decision, at any sample rate,
 * without storing any decision state at all.
 */

class DeterministicReviewSampler {
  private readonly sampleRate: number;
  // SHA-256 produces a 256-bit digest; using the first 8 hex chars (32
  // bits) as an integer gives a wide enough space that the sampling
  // decision doesn't meaningfully cluster or bias.
  private readonly hashSpace = 16 ** 8;

  constructor(sampleRate: number) {
    if (sampleRate < 0 || sampleRate > 1) {
      throw new Error(`sampleRate must be between 0.0 and 1.0, got ${sampleRate}`);
    }
    this.sampleRate = sampleRate;
  }

  /** Deterministically decides whether an item should be routed to human review. */
  shouldSample(stableId: string): boolean {
    const digest = crypto.createHash("sha256").update(stableId).digest("hex");
    const bucket = Number.parseInt(digest.slice(0, 8), 16);
    return bucket / this.hashSpace < this.sampleRate;
  }
}

async function main(): Promise<void> {
  console.log("--- Test 1: The Same ID Always Produces the Same Decision ---");
  const sampler = new DeterministicReviewSampler(0.1);

  const conversationId = "conv_9f3a2b7c";
  const decisions = Array.from({ length: 5 }, () => sampler.shouldSample(conversationId));
  console.log(`5 repeated calls for '${conversationId}': ${JSON.stringify(decisions)}`);
  if (new Set(decisions).size !== 1) {
    throw new Error(
      "BUG: the same ID produced different sampling decisions across repeated calls.",
    );
  }
  console.log(
    `[VERIFIED] All 5 calls for the same ID produced the identical decision (${decisions[0]}) - the sampler is genuinely deterministic.`,
  );

  console.log("\n--- Test 2: The Configured Sample Rate Holds Up Across a Large Population ---");
  const targetRate = 0.1;
  const largeSampler = new DeterministicReviewSampler(targetRate);
  const populationSize = 50_000;
  let sampledCount = 0;
  for (let i = 0; i < populationSize; i++) {
    if (largeSampler.shouldSample(`conv_${i}`)) sampledCount += 1;
  }
  const observedRate = sampledCount / populationSize;
  console.log(
    `Target rate: ${targetRate.toFixed(3)} | Observed rate over ${populationSize.toLocaleString()} IDs: ${observedRate.toFixed(4)}`,
  );
  if (Math.abs(observedRate - targetRate) >= 0.01) {
    throw new Error(
      `BUG: observed sample rate (${observedRate.toFixed(4)}) deviates from the target (${targetRate.toFixed(3)}) by more than 1%.`,
    );
  }
  console.log(
    `[VERIFIED] Observed rate (${observedRate.toFixed(4)}) is within 1% of the target (${targetRate.toFixed(3)}) across ${populationSize.toLocaleString()} distinct IDs.`,
  );

  console.log("\n--- Test 3: Increasing the Sample Rate Produces a Strict Superset ---");
  const lowRateSampler = new DeterministicReviewSampler(0.1);
  const highRateSampler = new DeterministicReviewSampler(0.2);
  const lowRateSampled = new Set<string>();
  const highRateSampled = new Set<string>();
  for (let i = 0; i < populationSize; i++) {
    const id = `conv_${i}`;
    if (lowRateSampler.shouldSample(id)) lowRateSampled.add(id);
    if (highRateSampler.shouldSample(id)) highRateSampled.add(id);
  }
  const isStrictSubset = [...lowRateSampled].every((id) => highRateSampled.has(id));
  if (!isStrictSubset) {
    throw new Error(
      "BUG: raising the sample rate should only ADD items to the sampled set, but some 10%-sampled IDs are missing from the 20% set.",
    );
  }
  console.log(
    `[VERIFIED] All ${lowRateSampled.size.toLocaleString()} IDs sampled at 10% are also included in the ${highRateSampled.size.toLocaleString()} IDs sampled at 20% - raising the rate is a strict superset, never a disjoint re-roll.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
