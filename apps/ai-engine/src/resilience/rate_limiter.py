"""Async token bucket rate limiter with exponential backoff - Day 29.

Protects concurrent model calls from tripping a provider's 429 rate limit:
requests draw from a token bucket that refills at a fixed rate, and back off
with exponential + jitter delay when the bucket runs dry, instead of firing
an unthrottled burst straight at the API.
"""

import asyncio
import random
import time

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class ThrottledAgentResult(BaseModel):
    query_id: int
    completion_text: str
    waited_seconds: float = Field(description="Time delayed waiting for token replenishment.")


class AsyncTokenBucket:
    def __init__(self, refill_rate_per_sec: float, max_capacity: float):
        self.refill_rate = refill_rate_per_sec
        self.max_capacity = max_capacity
        self.tokens = max_capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens_needed: float = 1.0, max_retries: int = 5) -> float:
        """Acquires tokens from the bucket, sleeping with exponential backoff if empty."""
        start_wait = time.monotonic()
        attempt = 0

        while True:
            async with self._lock:
                now = time.monotonic()
                elapsed = now - self.last_update
                self.last_update = now

                self.tokens = min(self.max_capacity, self.tokens + elapsed * self.refill_rate)

                if self.tokens >= tokens_needed:
                    self.tokens -= tokens_needed
                    total_waited = time.monotonic() - start_wait
                    return round(total_waited, 3)

            attempt += 1
            if attempt > max_retries:
                raise TimeoutError("Rate limit exceeded: Token bucket exhausted.")

            base_delay = 0.5 * (2 ** (attempt - 1))
            jitter = random.uniform(0.1, 0.4)  # noqa: S311 - jitter timing, not a security context
            sleep_duration = base_delay + jitter

            print(f" [RATE LIMIT HIT] Bucket empty. Backing off for {sleep_duration:.2f}s (Attempt {attempt})...")
            await asyncio.sleep(sleep_duration)


rate_limited_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=ThrottledAgentResult,
    system_prompt="We are an enterprise agent returning brief, type-safe summaries.",
)


async def dispatch_request(query_id: int, bucket: AsyncTokenBucket) -> ThrottledAgentResult:
    wait_time = await bucket.acquire(tokens_needed=1.0)

    prompt = f"Provide a one-line status report for microservice worker #{query_id}."
    result = await rate_limited_agent.run(prompt)

    data: ThrottledAgentResult = result.output
    data.query_id = query_id
    data.waited_seconds = wait_time

    print(f"Worker #{query_id} completed (Waited: {wait_time}s) -> {data.completion_text[:60]}...")
    return data


async def run_burst_benchmark() -> None:
    # Max burst capacity of 3 requests, refilling at 2 requests/sec.
    bucket = AsyncTokenBucket(refill_rate_per_sec=2.0, max_capacity=3.0)

    print("Step 1: Firing a burst of 8 concurrent requests through token bucket...")
    tasks = [dispatch_request(i + 1, bucket) for i in range(8)]

    results = await asyncio.gather(*tasks)
    print("\n--- Burst Execution Completed Successfully ---")
    print(f"Total Requests Processed: {len(results)}")
    for r in sorted(results, key=lambda x: x.query_id):
        print(f"  Worker #{r.query_id}: waited {r.waited_seconds}s")


if __name__ == "__main__":
    asyncio.run(run_burst_benchmark())
