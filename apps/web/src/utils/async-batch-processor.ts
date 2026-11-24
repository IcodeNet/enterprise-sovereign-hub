import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// The shape we want pulled out of each free-text job posting.
const BatchJobAnalysisSchema = z.object({
  title: z.string(),
  primarySkill: z.string(),
  isRemote: z.boolean(),
});

type BatchJobAnalysis = z.infer<typeof BatchJobAnalysisSchema>;

// A tiny counting semaphore: JavaScript has no built-in one (unlike
// Python's asyncio.Semaphore), so this is the minimum needed to cap how
// many API calls can be in flight at once. acquire() waits its turn if
// every slot is taken; release() is what lets the next waiter through.
class Semaphore {
  private available: number;
  private readonly waiting: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.available = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.available += 1;
    }
  }
}

// One worker's job: process a single item, but only after acquiring a slot
// from the shared semaphore. With a limit of 3, only 3 of these can be
// mid-API-call at any one instant, no matter how many items are in the batch.
async function processSingleJob(jobText: string, semaphore: Semaphore): Promise<BatchJobAnalysis> {
  await semaphore.acquire();
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: BatchJobAnalysisSchema,
      system: "We extract structured job details with max efficiency.",
      prompt: `Extract key attributes from: ${jobText}`,
    });
    return object;
  } finally {
    semaphore.release();
  }
}

// Fires off every item in the batch as its own promise, all at once, and
// lets the semaphore inside processSingleJob sort out the actual pacing.
// Promise.allSettled (JavaScript's version of gather with
// return_exceptions=True) is what keeps one failed item from taking the
// whole batch down - a failed item's rejection is captured in its own
// result entry instead of throwing and cancelling every other in-flight item.
async function processAllJobsConcurrently(
  jobBatch: string[],
  maxConcurrency = 5,
): Promise<PromiseSettledResult<BatchJobAnalysis>[]> {
  const semaphore = new Semaphore(maxConcurrency);
  const tasks = jobBatch.map((job) => processSingleJob(job, semaphore));
  return Promise.allSettled(tasks);
}

async function main() {
  const sampleJobs = [
    "Remote AI Engineer needed. Must master Pydantic AI and async Python.",
    "Senior Staff AI Architect. Focus on Vercel AI SDK and streaming UI.",
    "Lead RAG Engineer. Deep experience with LlamaIndex and vector DBs.",
    "Agentic AI Engineer. LangGraph state machines and OpenTelemetry.",
    "MCP Infrastructure Engineer. FastMCP servers and tool protocols.",
  ];

  const startTime = performance.now();
  console.log(
    `Starting concurrent batch run for ${sampleJobs.length} items (Max Concurrency: 3)...`,
  );

  const results = await processAllJobsConcurrently(sampleJobs, 3);

  const durationSeconds = (performance.now() - startTime) / 1000;
  console.log(`\n--- Batch Execution Finished in ${durationSeconds.toFixed(2)} seconds ---`);

  results.forEach((res, idx) => {
    if (res.status === "rejected") {
      console.log(`Item ${idx + 1}: FAILED -> ${res.reason}`);
    } else {
      const job = res.value;
      console.log(
        `Item ${idx + 1}: ${job.title} | Skill: ${job.primarySkill} | Remote: ${job.isRemote}`,
      );
    }
  });
}

main().catch(console.error);
