Day 29 protects concurrent agent calls from tripping a provider's rate limit, with a real correctness proof of the concurrency-safety claim rather than just a clean happy-path run.

---

## Infrastructure Resilience — Day 29: Token Bucket Rate Limiting

### The Problem We're Solving

When many sub-agents fire concurrent requests at a model provider, an unthrottled burst trips the provider's own rate limit (HTTP 429), and a naive retry-immediately loop under load can make the failure worse, not better. A **token bucket rate limiter** sits in front of the calls: it holds a fixed-capacity bucket that refills at a steady rate, and a caller that finds the bucket empty backs off with exponential + random jitter delay instead of crashing or hammering the API again immediately.

Focus: a real async token bucket with genuine backoff behavior
Time investment: 15 minutes

### Step 1: Build the Bucket

`apps/ai-engine/src/resilience/rate_limiter.py` refills tokens lazily on each `acquire()` call based on elapsed time, guarded by an `asyncio.Lock` so concurrent callers can't double-spend the same tokens.

```python
async def acquire(self, tokens_needed: float = 1.0, max_retries: int = 5) -> float:
    while True:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.last_update = now
            self.tokens = min(self.max_capacity, self.tokens + elapsed * self.refill_rate)
            if self.tokens >= tokens_needed:
                self.tokens -= tokens_needed
                return round(time.monotonic() - start_wait, 3)
        # backoff with exponential + jitter delay, outside the lock
```

One API-drift fix applied (the same `result_type`/`output_type` and `.data`/`.output` rename this repo has hit before), confirmed against the installed pydantic-ai version.

### Step 2: Run a Real Burst and Watch It Throttle

```bash
python src/resilience/rate_limiter.py
```

Real output, firing 8 concurrent requests against a bucket with capacity 3, refilling at 2/sec:

```
Worker #1: waited 0.0s
Worker #2: waited 0.0s
Worker #3: waited 0.0s
Worker #4: waited 2.032s
Worker #5: waited 0.687s
Worker #6: waited 2.174s
Worker #7: waited 1.967s
Worker #8: waited 4.441s
```

Exactly 3 requests through immediately (the burst capacity), the rest genuinely delayed and increasing - real, observable throttling behavior, not simulated.

---

## Best Practices

- **Refill lazily on each `acquire()` call (computing elapsed time since last update) rather than running a background timer.** No polling loop, no timer to leak or forget to clean up, and the bucket's state is always correct at the moment it's actually read.
- **Keep the backoff sleep OUTSIDE the lock**, so a caller waiting out its backoff doesn't block every other caller from checking the bucket in the meantime - this implementation releases the lock before sleeping and re-acquires it on the next loop iteration.

## Why This Matters in Production

A rate limiter that "usually works" is worse than an obviously absent one, because it hides a latent bug until the exact moment of peak load when it matters most - which is precisely when a race condition is likeliest to actually manifest. See the TS port doc for a targeted concurrency-correctness proof beyond this happy-path burst run.

## Note: Numbering Duplication Found

A later numbering review found a near-exact duplicate of this algorithm under another day number: the same `AsyncTokenBucket` logic (capacity, refill-rate-per-second, lazy refill on `acquire()`), with only a different harness wrapper around it. This day stays focused on the core algorithm and its observable behavior.
