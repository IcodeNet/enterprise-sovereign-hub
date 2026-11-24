Day 56, the final day of this portfolio, walks backward through eval history to find a fully passing baseline instead of trusting whatever ran most recently - and directly proves the naive "compare against yesterday" approach would have silently re-approved a real regression forever.

---

## Observability & Eval Methodology — Day 56: Last-Approved Baseline Promotion for Eval Gates

This day is independently designed. It generalizes a widely used eval-methodology pattern for release-gate reliability.

### The Problem We're Solving

An eval suite that only compares a new candidate against yesterday's result has a real, easy-to-miss failure mode: if yesterday's run is also a regression that slipped through the gate, comparing against it just re-approves the same regression forever - "no worse than yesterday" quietly becomes "no worse than the last bad thing we shipped." Last-approved baseline promotion fixes this by walking BACKWARD through recent history to find the newest report that actually PASSED its own gate, and comparing the new candidate against THAT - a real approved baseline, not just whatever ran most recently.

Focus: backward-walking baseline selection, with a direct side-by-side proof of the naive approach's failure mode
Time investment: 15 minutes

### Step 1: Build the Baseline Finder

`apps/ai-engine/src/evals/baseline_promotion.py`'s `find_promotable_baseline()` walks history in reverse, skipping any report whose OWN gate never passed:

```python
def find_promotable_baseline(history: List[EvalReport], suite_name: str) -> Optional[EvalReport]:
    for report in reversed(history):
        if report.suite_name == suite_name and report.gate_passed:
            return report
    return None
```

### Step 2: Directly Prove the Naive Alternative Would Have Failed

Beyond testing that the correct baseline is found, the real proof this pattern matters is showing what the NAIVE alternative ("just compare against the most recent report") would have done wrong on the exact same data: compared the candidate against a report that itself never passed its own gate.

### Step 3: Run and Verify All 3 - Real Results

```
[VERIFIED] Baseline correctly skipped the failing commit ('e4f5g6h', rate=0.71) and landed on the last fully passing one ('a1b2c3d', rate=0.94).
Comparison result: {'baseline_commit': 'a1b2c3d', 'baseline_rate': 0.94, 'candidate_rate': 0.9, 'drop_points': 4.0, 'is_regression': True}
[VERIFIED] The candidate (90%) vs. the genuine baseline (94%) is correctly flagged as a regression (4.0 points, exceeds the 2-point tolerance).

--- Test 2: Proving the Naive 'Most Recent Report' Approach Would Have Missed This ---
Naive comparison (against the failing commit, not the real baseline): {'baseline_commit': 'e4f5g6h', 'baseline_rate': 0.71, 'candidate_rate': 0.9, 'drop_points': -19.0, 'is_regression': False}
[CONFIRMED THE FAILURE MODE] Comparing against the most recent report... incorrectly shows NO regression.

[VERIFIED] A suite with zero fully passing history correctly reports no promotable baseline, rather than silently skipping the regression check.
```

The real, load-bearing result: comparing the SAME 90%-passing candidate against the correct baseline (94%) correctly flags a 4-point regression, while comparing it against the naive "most recent report" (a broken 71% commit) shows a false -19-point IMPROVEMENT - completely hiding the real regression. Test 3 confirms the honest fallback: a suite with no passing history at all correctly reports "no baseline available" rather than silently skipping the check.

A real bug was caught and fixed while building this: an early version of Test 1's own assertion had its logic inverted (`assert not comparison["is_regression"]` when it should have asserted the regression WAS flagged) - running the code immediately surfaced this via a clear `AssertionError`, exactly the kind of self-check that catches a wrong test before it ships as a false "verified."

---

## Best Practices

- **Directly compute and show what the WRONG approach would have produced, on the SAME data, not just what the RIGHT approach produces.** Test 2 is the actual argument for why this pattern matters - a reader seeing only "the correct baseline was found" might not appreciate that the naive alternative would have hidden a real regression; seeing the naive comparison's wrong, dangerous-looking result makes the stakes concrete.
- **Handle "no promotable baseline exists" as an explicit, honest case - never silently skip the regression check.** A brand-new suite with no history yet, or a suite where every recorded run failed its own gate, needs to surface that clearly rather than quietly approving anything.
- **Run your own verification code and actually read the failure when it surfaces one.** The inverted assertion in the first draft of Test 1 was caught immediately because the code was actually executed, not just written and assumed correct - the exact discipline this whole 56-day portfolio has applied throughout.

## Why This Matters in Production

An eval gate exists to catch regressions before they ship - a gate that silently ratchets its own baseline down to whatever bad thing shipped last is worse than no gate at all, because it creates false confidence. This pattern, and the direct side-by-side proof of what the naive version gets wrong, is the concrete argument for why "compare against the most recent run" is never sufficient on its own.

---

## Continuity Note

Day 56 establishes the baseline-selection control. Day 57 extends this with a consecutive-pass promotion window so promotion timing and baseline choice are both guarded.
