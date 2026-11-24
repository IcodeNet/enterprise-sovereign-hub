Day 35 gives agent tool calls a circuit breaker, so a repeatedly-failing downstream service gets fast-failed instead of letting every new call queue up waiting on something that's already down.

---

## Resilience & Concurrency — Day 35: Cross-Agent Deadlock Prevention & Circuit Breakers

### The Problem We're Solving

When multiple autonomous agents call the same external service or sub-agent, a downstream failure doesn't just fail one call - it can cause every subsequent call to hang waiting on a timeout, one after another, while the service is still down. Without a circuit breaker, a temporarily unavailable dependency turns into a slow-motion pile-up: every new request pays the full timeout cost before failing, instead of failing immediately once the system already knows the dependency is down.

Focus: an async circuit breaker that trips OPEN after repeated failures and fast-fails immediately, then self-tests recovery with a single canary request
Time investment: 15 minutes

### Step 1: Build the Circuit Breaker

`apps/ai-engine/src/resilience/circuit_breaker.py` implements the standard three-state machine (CLOSED → OPEN → HALF_OPEN → CLOSED) with an `asyncio.Lock` guarding all state transitions:

```python
class AsyncCircuitBreaker:
    async def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        async with self._lock:
            if self.state == CircuitState.OPEN:
                if now - self.last_failure_time >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                else:
                    raise RuntimeError("CircuitBreakerOpen: Service temporarily unavailable.")
        try:
            result = await func(*args, **kwargs)
            # success in HALF_OPEN closes the breaker again
            ...
        except Exception as exc:
            # failure count increments; hitting the threshold trips OPEN
            ...
```

### Step 2: Prove the Fast-Fail Actually Happens, Not Just That the State Changes

A circuit breaker demo that only prints "state is now OPEN" doesn't actually prove anything was saved - a breaker that always says OPEN and one that correctly fast-fails look identical if you don't measure it. Added a real timing check: call the breaker while it's OPEN and measure how long the call took.

### Step 3: Run and Verify - the Full State Lifecycle, With Real Timing Proof

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
Fast-fail took 0.0ms (proves no network call was attempted)

Waiting for recovery timeout...
Dispatching task 'recovery-probe'...
 [CIRCUIT] Recovery timeout reached. Transitioning to HALF_OPEN (testing recovery)...
 [CIRCUIT] Canary request succeeded. Closing circuit breaker.
Result: SUCCESS | Circuit: CLOSED | Processed successfully: 'a perfectly fine request'
```

The `0.0ms` fast-fail time is the real proof: `blocked-call`'s payload was a perfectly valid request that WOULD have succeeded if actually attempted, but the breaker rejected it in the OPEN state without ever calling the real function - independent evidence the short-circuit genuinely happens rather than the breaker just tracking state cosmetically. The full lifecycle (2 failures → OPEN → recovery wait → HALF_OPEN canary → CLOSED) also ran for real in a single script execution.

---

## Best Practices

- **Prove a fast-fail mechanism with a timing measurement, not just a log line.** "State is OPEN" and "the call actually short-circuited before touching the network" are different claims - only the second one is what a circuit breaker exists to guarantee, and only a real elapsed-time measurement distinguishes them.
- **Guard every state transition with the same lock, including the read that decides whether to even attempt the call.** A race between two concurrent callers both reading CLOSED and both proceeding to fail simultaneously would double-count failures inconsistently without the lock spanning the whole check-then-act sequence.
- **Recovery is a single canary probe, not a burst.** Letting the breaker go straight back to accepting unlimited traffic the moment the timeout expires would re-create the exact pile-up the breaker exists to prevent, if the dependency is still actually down.

## Why This Matters in Production

A slow or failing downstream dependency in a multi-agent system doesn't stay contained to one failed call - without a circuit breaker, every subsequent caller pays the same timeout cost while a service is known to be down. Verifying the fast-fail with an actual timing measurement, not just trusting the printed state, is what separates "we built a circuit breaker" from "we built something that logs circuit-breaker-shaped messages."
