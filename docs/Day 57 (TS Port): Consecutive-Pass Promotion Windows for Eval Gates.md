TypeScript port of Day 57, matching the same promotion-window semantics as Python.

---

## Observability & Eval Methodology — Day 57 (TS Port): Consecutive-Pass Promotion Windows for Eval Gates

### What stayed the same

- same `windowSize` and `maxRegression` behavior,
- same 3 test scenarios,
- same operator-facing reason strings.

Implementation file:

- `apps/web/src/evals/consecutive-pass-promotion.ts`

### Run and Verify — Real Output

Run command:

`cd apps/web && npx tsx src/evals/consecutive-pass-promotion.ts`

Real output:

```
--- Test 1: One Good Run Is Not Enough If the Window Is Unstable ---
Decision: promote=false | reason=window contains gate failures: ["r102"]
[VERIFIED] Promotion correctly blocked because one run in the window failed its gate.

--- Test 2: Stable 3-Run Pass Window Promotes ---
Decision: promote=true | reason=3 consecutive passes within regression tolerance
[VERIFIED] Promotion allowed after 3 consecutive passing runs stayed within tolerance.

--- Test 3: Consecutive Passes Still Block If Any Run Regresses Too Far ---
Decision: promote=false | reason=run r302 regressed 0.030 > allowed 0.020
[VERIFIED] Promotion correctly blocked even with consecutive passes because one run regressed beyond tolerance.
```

File-quality checks run in this session:

- `npx oxfmt --check src/evals/consecutive-pass-promotion.ts` -> pass
- `npx oxlint src/evals/consecutive-pass-promotion.ts` -> pass

### Practical note found while running

A first draft compared floating-point values with strict `drop > maxRegression`, which misclassified an exact-threshold case due to floating precision. The final version uses `drop - maxRegression > 1e-9`, and both Python and TS now agree on the same boundary behavior.