import asyncio
import time
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()


# The shape we want pulled out of each free-text job posting.
class BatchJobAnalysis(BaseModel):
    title: str
    primary_skill: str
    is_remote: bool


batch_agent = Agent(
    "openai:gpt-4o",
    output_type=BatchJobAnalysis,
    system_prompt="We extract structured job details with max efficiency.",
)


# One worker's job: process a single item, but only after acquiring a slot
# from the shared semaphore. `async with semaphore` blocks THIS worker (not
# the whole program) until a slot opens up - so with a limit of 3, only 3
# of these can be mid-API-call at any one instant, no matter how many items
# are in the batch.
async def process_single_job(job_text: str, semaphore: asyncio.Semaphore) -> BatchJobAnalysis:
    async with semaphore:
        result = await batch_agent.run(f"Extract key attributes from: {job_text}")
        return result.output


# Fires off every item in the batch as its own task, all at once, and lets
# the semaphore inside process_single_job sort out the actual pacing. This
# is different from running them one at a time in a loop: here, every task
# already exists and is ready to run the instant a semaphore slot frees up,
# rather than the next one only starting once the current one fully finishes.
async def process_all_jobs_concurrently(job_batch: list[str], max_concurrency: int = 5) -> list[Any]:
    semaphore = asyncio.Semaphore(max_concurrency)

    tasks = [process_single_job(job, semaphore) for job in job_batch]

    # return_exceptions=True is what keeps one failed item from taking the
    # whole batch down with it - a failed task's exception object is
    # returned in its place in the results list, instead of asyncio.gather
    # immediately raising and cancelling every other still-running task.
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
