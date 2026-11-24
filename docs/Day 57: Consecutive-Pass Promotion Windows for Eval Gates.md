Day 57 adds a stability-window gate on top of Day 56's baseline logic: promotion now requires consecutive passing runs, so one lucky green run cannot ship by itself.

---

## Observability & Eval Methodology — Day 57: Consecutive-Pass Promotion Windows for Eval Gates

### The Problem We're Solving

Day 56 fixed baseline selection by comparing candidates against the last genuinely approved baseline, not the most recent run. But one more production risk remains: a single green run can still be noise (temporary model variance, flaky dependency behavior, or transient infra luck). If we promote after one pass, quality can oscillate in and out of production.

Day 57 adds a stability window: require N consecutive passes (default 3), and still enforce per-run regression tolerance vs the approved baseline.

Focus: promotion-window gating with explicit reasons for allow/deny
Time investment: 15 minutes

### Step 1: Build the Window Decision

`apps/ai-engine/src/evals/consecutive_pass_promotion.py` adds `should_promote_after_window()`:

- reject if fewer than `window_size` runs exist,
- reject if any run in the window failed its own gate,
- reject if any run regressed more than `max_regression` from approved baseline,
- promote only when all checks pass.

### Step 2: Cover the Three Load-Bearing Cases

1. Unstable window (contains a failed run) -> block.
2. Stable 3-run window (all pass, all within tolerance) -> promote.
3. Consecutive passes but one run regressed too far -> block.

### Step 3: Run and Verify — Real Output

Python run command:

`cd apps/ai-engine && python src/evals/consecutive_pass_promotion.py`

Real output:

```
--- Test 1: One Good Run Is Not Enough If the Window Is Unstable ---
Decision: promote=False | reason=window contains gate failures: ['r102']
[VERIFIED] Promotion correctly blocked because one run in the window failed its gate.

--- Test 2: Stable 3-Run Pass Window Promotes ---
Decision: promote=True | reason=3 consecutive passes within regression tolerance
[VERIFIED] Promotion allowed after 3 consecutive passing runs stayed within tolerance.

--- Test 3: Consecutive Passes Still Block If Any Run Regresses Too Far ---
Decision: promote=False | reason=run r302 regressed 0.030 > allowed 0.020
[VERIFIED] Promotion correctly blocked even with consecutive passes because one run regressed beyond tolerance.
```

What was verified in this run:

- syntax check passed: `python -m py_compile src/evals/consecutive_pass_promotion.py`
- unstable window denied,
- stable window allowed,
- over-tolerance regression denied.

---

## Best Practices

- Keep rejection reasons explicit and machine-readable. "failed" is not enough for operations; "run r302 regressed 0.030 > allowed 0.020" is actionable.
- Treat consecutive-pass windows and baseline comparisons as complementary controls, not substitutes.
- Defend numeric boundary checks from floating-point edge cases (`1e-9` guard used here) so equality-at-threshold does not randomly flip decisions.

## Why This Matters in Production

This closes a real release-gap between "correct comparison target" (Day 56) and "stable promotion timing" (Day 57). Together they reduce two different false-green paths: comparing against the wrong baseline and promoting on a one-off lucky run.