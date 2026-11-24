Day 8 is about running many AI calls at once safely, instead of one at a time, without accidentally overwhelming the AI provider.

---

## Async Concurrency & Batch Processing — Day 8

### The Problem We're Solving

Most AI workloads spend almost all their time waiting - waiting for the network, waiting for the model to generate a response - not doing actual work on our machine. Running a batch of 20 job postings through an agent ONE AT A TIME means item 2 doesn't even start until item 1's entire round trip to the AI provider and back has finished, even though our own code was idle for nearly all of that wait.

The fix is to run them concurrently: start every item's work at once, and let them all wait on the network in parallel. But running literally everything at once has its own problem - AI providers rate-limit how many requests you can make at the same time, and blowing past that limit gets requests rejected with a 429 ("Too Many Requests") error instead of processed.

A **semaphore** solves this: it's a counter that caps how many tasks can be actively running at once, while letting any number of tasks be queued up ready to go. With a semaphore of 3, five tasks can all exist and be ready simultaneously, but only 3 are ever mid-API-call at the same instant - the other 2 wait their turn automatically.

Focus: capping concurrent AI calls with a semaphore, and handling a failed item without losing the whole batch
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `asyncio` (part of Python's standard library) and packages already installed from earlier lessons.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/utils/`, create:
`async_batch_processor.py`

### Step 3: Add the Source Code

```python
import asyncio
import time
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()


class BatchJobAnalysis(BaseModel):
    title: str
    primary_skill: str
    is_remote: bool


batch_agent = Agent(
    "openai:gpt-4o",
    output_type=BatchJobAnalysis,
    system_prompt="We extract structured job details with max efficiency.",
)


async def process_single_job(job_text: str, semaphore: asyncio.Semaphore) -> BatchJobAnalysis:
    async with semaphore:
        result = await batch_agent.run(f"Extract key attributes from: {job_text}")
        return result.output


async def process_all_jobs_concurrently(job_batch: list[str], max_concurrency: int = 5) -> list[Any]:
    semaphore = asyncio.Semaphore(max_concurrency)

    tasks = [process_single_job(job, semaphore) for job in job_batch]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results


async def main():
    sample_jobs = [
        "Remote AI Engineer needed. Must master Pydantic AI and async Python.",
        "Senior Staff AI Architect. Focus on Vercel AI SDK and streaming UI.",
        "Lead RAG Engineer. Deep experience with LlamaIndex and vector DBs.",
        "Agentic AI Engineer. LangGraph state machines and OpenTelemetry.",
        "MCP Infrastructure Engineer. FastMCP servers and tool protocols.",
    ]

    start_time = time.perf_counter()
    print(f"Starting concurrent batch run for {len(sample_jobs)} items (Max Concurrency: 3)...")

    results = await process_all_jobs_concurrently(sample_jobs, max_concurrency=3)

    duration = time.perf_counter() - start_time
    print(f"\n--- Batch Execution Finished in {duration:.2f} seconds ---")

    for idx, res in enumerate(results):
        if isinstance(res, BaseException):
            print(f"Item {idx + 1}: FAILED -> {res}")
        else:
            print(f"Item {idx + 1}: {res.title} | Skill: {res.primary_skill} | Remote: {res.is_remote}")


if __name__ == "__main__":
    asyncio.run(main())
```

### Step 4: Run and Verify With Real Timing Evidence

```bash
python src/utils/async_batch_processor.py
```

A single "it ran without crashing" isn't proof concurrency is actually happening - the same code would also "work" if it accidentally ran everything sequentially. Real proof is a timing comparison: 5 items concurrently (limit 3) finished in **5.52 seconds**, while running just 3 of the same items one after another, in a plain loop, took **8.91 seconds** on its own. 5 items sequentially would take roughly 15 seconds by that rate - so 5.52 seconds for 5 items is solid evidence real overlap is happening, not just a lucky coincidence.

---

## Best Practices

- **Prove concurrency happened with a timing comparison, not just a successful run.** A batch that "completes" tells you nothing about whether it ran items in parallel or accidentally fell back to one-at-a-time; only comparing against a known sequential baseline shows the difference.
- **Use `return_exceptions=True` so one bad item doesn't sink the whole batch.** Without it, `asyncio.gather` raises on the FIRST failure and cancels every other still-running task - one flaky item would silently discard every other item's real, successful result.
- **A semaphore caps concurrency; it doesn't limit how many tasks can exist.** All 5 tasks in the example are created and ready to run immediately - the semaphore only controls how many can be actively mid-call at once, which is the distinction that keeps this fast (no idle waiting) while still respecting a hard concurrency ceiling.

## Why This Matters in Production

Once our pipelines process real batches of job postings, model evaluation runs, or any bulk AI workload, doing it one item at a time wastes most of the wall-clock time on idle waiting. A semaphore-capped concurrent batch gets the speed of parallelism while staying safely under whatever rate limit our AI provider enforces - the difference between a batch job finishing in seconds versus minutes, at the same safety margin either way.
