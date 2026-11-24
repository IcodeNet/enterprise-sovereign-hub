Day 29's TypeScript port builds the same rate-limiting guarantee without a native async-lock primitive, and proves the resulting mutex is actually race-free under real concurrent pressure - not just under a normal burst's lighter contention.

---

## Infrastructure Resilience — Day 29 (TS Port): Token Bucket Rate Limiting

### The Problem We're Solving

When many sub-agents fire concurrent requests at a model provider, an unthrottled burst trips the provider's own rate limit (HTTP 429). A **token bucket rate limiter** sits in front of the calls: a fixed-capacity bucket refills at a steady rate, and a caller that finds it empty backs off with exponential + jitter delay instead of hammering the API again immediately.

Focus: building the same throttling guarantee as the Python side without a native async mutex, and a concurrency-safety proof beyond "it ran without crashing"
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the bucket (`apps/ai-engine/src/resilience/rate_limiter.py`) | the bucket (`apps/web/src/resilience/rate-limiter.ts`) |
| taking a token (`async def acquire(self, tokens_needed: float = 1.0, max_retries: int = 5)`) | taking a token (`acquire()`) |
| stopping two callers spending the same token (`asyncio.Lock`, `async with self._lock:`) | stopping two callers spending the same token (a promise-chain mutex built with `Promise.withResolvers()`) |
| the burst test (8 concurrent requests, capacity 3, refill 2/sec) | the burst test (the same 8 requests, capacity 3, refill 2/sec) |
| proving no double-spend (see the TS Port doc) | proving no double-spend (`new TestBucket(20)` + `Promise.all(Array.from({ length: 30 }, () => bucket.acquire()))`) |

### Step 1: The Concurrency Primitive Doesn't Exist Natively in JavaScript

Python's `asyncio.Lock` has no direct JavaScript equivalent - Node has no built-in async mutex. `apps/web/src/resilience/rate-limiter.ts` implements the same serialization guarantee with a promise chain: each `acquire()` call captures the current "mutex" promise, replaces it with a fresh unresolved one via `Promise.withResolvers()`, awaits the previous one before touching shared state, and releases its own when done - the same effect as a lock, built from promises alone.

### Step 2: Run the Same Burst Configuration

Running the identical burst configuration (capacity 3, refill 2/sec, 8 concurrent requests) produced the same real throttling shape as the Python side:

```
Worker #1: waited 0s
Worker #2: waited 0s
Worker #3: waited 0s
Worker #4: waited 4.229s
...
```

### Step 3: A Real Correctness Proof - Not Just "It Ran Without Crashing"

A clean burst run proves the bucket THROTTLES, but doesn't prove the promise-chain mutex actually prevents a race under real concurrent pressure - a subtly broken lock could still "work" most of the time and only fail under contention. Verified directly with a targeted test designed to catch a double-spend:

```typescript
const bucket = new TestBucket(20); // exactly 20 tokens, no refill
const results = await Promise.all(Array.from({ length: 30 }, () => bucket.acquire()));
const successCount = results.filter(Boolean).length;
// Successful acquisitions: 20 (expected exactly 20)
```

Firing 30 concurrent acquisitions against a bucket with exactly 20 tokens and zero refill rate must grant EXACTLY 20 successes - any race condition in the locking would show up as more than 20 (a double-spent token) or fewer than 20 (a token lost to a bad interleaving). The real result was exactly 20, both times run - genuine evidence the promise-chain mutex correctly serializes access under real concurrent load, not just under the lighter concurrency a normal burst happens to produce.

`tsc --noEmit` and `oxlint` both clean (two real oxlint fixes: extracted the `Promise.withResolvers()` pattern to satisfy `consistent-function-scoping`, `toSorted()` instead of `sort()`). `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **A clean run of the happy path proves the feature works; it does not prove a concurrency-safety claim.** The real proof here is the exact-count test under maximum contention (30 concurrent callers vs 20 tokens, zero refill) - designed specifically to make a race condition visible as a wrong number, not to just exercise the normal path again.
- **When a language lacks a primitive the other language has natively (Python's `asyncio.Lock` here), don't skip the guarantee - build the equivalent explicitly and verify it holds.** A promise-chain mutex is a well-known JS pattern, but "well-known" isn't the same as "verified correct in this specific implementation."

## Why This Matters in Production

The targeted 20-vs-30 concurrency test here is the difference between "I ran it and nothing crashed" and "I designed a test that would have caught the specific failure mode this code is supposed to prevent." That distinction matters most exactly where a hand-built concurrency primitive (not a language-native one) is standing in for a guarantee the runtime doesn't provide for free.
