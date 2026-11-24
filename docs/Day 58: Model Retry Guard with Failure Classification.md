Day 58 adds explicit retry classification so we retry transient failures, stop immediately on fatal failures, and enforce a hard retry budget.

---

## Resilience & Safety — Day 58: Model Retry Guard with Failure Classification

### The Problem We're Solving

A generic retry loop can fail in two opposite ways:

1) It retries fatal failures forever, wasting time and cost.
2) It gives up on transient failures that usually recover.

This day builds a small retry guard with explicit failure classes (`transient`, `fatal`) and a strict retry budget.

Focus: deterministic retry control and stop conditions
Time investment: 15 minutes

### Step 1: Build the Guard

`apps/ai-engine/src/agents/model_retry_guard.py` defines:

- `decide_retry()` for policy decisions,
- `run_with_guard()` for deterministic simulation.

Policy:

- success -> stop,
- fatal failure -> stop immediately,
- transient failure + budget remaining -> retry,
- transient failure + budget exhausted -> stop.

### Step 2: Prove 3 Cases

1. transient then success -> recover.
2. fatal failure -> no retry.
3. repeated transient failures -> stop exactly at budget.

### Step 3: Run and Verify — Real Output

Command:

`cd apps/ai-engine && python src/agents/model_retry_guard.py`

Output:

```
--- Test 1: Transient failure then success should recover within budget ---
Result: recovered=True, attempts=2, reason=completed
[VERIFIED] Transient failure was retried and recovered.

--- Test 2: Fatal failure should stop immediately with no retry ---
Result: recovered=False, attempts=1, reason=fatal error - stop immediately
[VERIFIED] Fatal failure correctly stopped without wasting retry budget.

--- Test 3: Repeated transient failures should stop at retry budget ---
Result: recovered=False, attempts=3, reason=retry budget exhausted (2)
[VERIFIED] Retry loop stopped exactly at the configured budget.
```

Additional check run:

- `python -m py_compile src/agents/model_retry_guard.py` -> pass

## Best Practices

- Make failure classes explicit and machine-readable.
- Keep retry budgets hard and visible.
- Return operator-facing reasons for every stop path.

## Why This Matters in Production

This prevents silent runaway retries and makes recovery behavior deterministic under failure, which is necessary for stable production operations.