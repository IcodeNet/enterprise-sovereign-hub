Day 35's TypeScript port builds the same circuit breaker using a Promise-chain mutex in place of `asyncio.Lock`, and reproduces the same real timing proof that the fast-fail actually short-circuits.

---

## Resilience & Concurrency — Day 35 (TS Port): Cross-Agent Deadlock Prevention & Circuit Breakers

### The Problem We're Solving

Same problem as the Python lesson: a failing downstream dependency causes every subsequent call to pile up waiting on the same timeout, unless something fast-fails once the system already knows the service is down.

Focus: the same three-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED), built with a Promise-chain mutex instead of a native async lock
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the state machine (`class AsyncCircuitBreaker`) | the state machine (`class AsyncCircuitBreaker`) |
| guarding state transitions (`asyncio.Lock`, `async with self._lock:`) | guarding state transitions (a Promise-chain mutex built with `Promise.withResolvers()`, same pattern as Day 29's rate limiter) |
| the state check before attempting the call (inside the `async with self._lock:` block) | the state check before attempting the call (inside `await this.withLock(() => {...})`) |
| enforcing a timeout guard around the call (`asyncio.wait_for(breaker.call(...), timeout=3.0)`) | enforcing a timeout guard around the call (`Promise.race([promise, timeoutPromise])`) |

### Step 1: Build the Mutex, Since JS Has No Native `asyncio.Lock`

```typescript
private mutexQueue: Promise<void> = Promise.resolve();

private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const { promise, resolve } = Promise.withResolvers<void>();
  const previous = this.mutexQueue;
  this.mutexQueue = promise;
  await previous;
  try {
    return await fn();
  } finally {
    resolve();
  }
}
```

Every state-changing block (the pre-call state check, the success handler, the failure handler) goes through this same `withLock`, so two concurrent callers can't race on `failureCount` or `state`.

### Step 2: Run and Verify - Same Real Timing Proof, Same Full Lifecycle

```
Dispatching task 'fail-0'...
 [CIRCUIT] Call failed (1/2): Downstream service crashed.
Result: FAILED | Circuit: CLOSED | Downstream service crashed.
Dispatching task 'fail-1'...
 [CIRCUIT] Call failed (2/2): Downstream service crashed.
 [CIRCUIT ALERT] Failure threshold reached. Circuit breaker is now OPEN.
Result: FAILED | Circuit: OPEN | Downstream service crashed.
Dispatching task 'blocked-call'...
Result: FAILED | Circuit: OPEN | CircuitBreakerOpen: Service temporarily unavailable.
Fast-fail took 0ms (proves no network call was attempted)
Waiting for recovery timeout...
Dispatching task 'recovery-probe'...
 [CIRCUIT] Recovery timeout reached. Transitioning to HALF_OPEN (testing recovery)...
 [CIRCUIT] Canary request succeeded. Closing circuit breaker.
Result: SUCCESS | Circuit: CLOSED | Processed successfully: 'a perfectly fine request'
```

Identical result shape to the Python side: `0ms` fast-fail time, full CLOSED → OPEN → HALF_OPEN → CLOSED lifecycle in one run. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **A hand-rolled Promise-chain mutex needs the SAME lock instance guarding every state-mutating block, not one lock per method.** A separate mutex per method would let a state check in one method race against a state write in another - the whole point is one serialized queue across all of the breaker's state transitions.
- **`Promise.race` for a timeout guard leaves the losing promise still running in the background** (unlike Python's `asyncio.wait_for`, which actually cancels the underlying task). For a real production circuit breaker, this is a genuine difference worth knowing about - the "timed out" branch wins the race, but the original call isn't actually cancelled, just ignored.

## Why This Port Matters in Production

The exact same fast-fail guarantee holds across both languages, verified with the same 0ms timing proof - but the underlying primitive differs in a way that matters under real load: Python's `asyncio.wait_for` genuinely cancels a timed-out call, while `Promise.race` in JS lets the loser keep running unseen. Porting a resilience pattern faithfully means understanding what the target language's building blocks actually guarantee, not just matching the surface-level API shape.
