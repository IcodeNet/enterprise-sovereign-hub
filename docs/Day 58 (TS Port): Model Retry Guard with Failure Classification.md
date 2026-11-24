TypeScript port of Day 58 with the same retry semantics and verification scenarios.

---

## Resilience & Safety — Day 58 (TS Port): Model Retry Guard with Failure Classification

Implementation file:

- `apps/web/src/agents/model-retry-guard.ts`

Shared behavior with Python:

- retry transient failures,
- stop immediately on fatal failures,
- stop at retry budget boundary with explicit reason.

### Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/model-retry-guard.ts`

Output:

```
--- Test 1: Transient failure then success should recover within budget ---
Result: recovered=true, attempts=2, reason=completed
[VERIFIED] Transient failure was retried and recovered.

--- Test 2: Fatal failure should stop immediately with no retry ---
Result: recovered=false, attempts=1, reason=fatal error - stop immediately
[VERIFIED] Fatal failure correctly stopped without wasting retry budget.

--- Test 3: Repeated transient failures should stop at retry budget ---
Result: recovered=false, attempts=3, reason=retry budget exhausted (2)
[VERIFIED] Retry loop stopped exactly at the configured budget.
```

Checks run:

- `npx oxfmt --check src/agents/model-retry-guard.ts` -> pass
- `npx oxlint src/agents/model-retry-guard.ts` -> pass

This keeps retry control behavior aligned between Python and TypeScript for the same failure inputs.