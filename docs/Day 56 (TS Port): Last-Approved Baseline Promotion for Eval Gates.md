Day 56's TypeScript port, the final port of this portfolio, reproduces the identical backward-walking baseline logic and the same naive-approach failure-mode proof, with exact-matching numbers to Python.

---

## Observability & Eval Methodology — Day 56 (TS Port): Last-Approved Baseline Promotion for Eval Gates

### The Problem We're Solving

Same problem as the Python lesson: an eval gate needs to compare against a fully passing baseline, not whatever ran most recently - or it silently ratchets its own bar down to the last bad thing that shipped.

Focus: the same backward-walking baseline search, plus the same direct proof of the naive alternative's failure mode
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the backward-walking search (`for report in reversed(history)`) | the backward-walking search (`for (let i = history.length - 1; i >= 0; i--)`) |
| the baseline finder (`find_promotable_baseline(history, suite_name)`) | the baseline finder (`findPromotableBaseline(history, suiteName)`) |
| the regression comparison (`compare_against_baseline(candidate, baseline, tolerance)`) | the regression comparison (`compareAgainstBaseline(candidate, baseline, tolerance)`) |

### Step 1: Build the Baseline Finder

Structurally identical: iterate history in reverse, return the first report matching the suite name whose OWN gate passed.

### Step 2: Run and Verify - Exact-Value Match with Python, Same Failure-Mode Proof

```
[VERIFIED] Baseline correctly skipped the failing commit ('e4f5g6h', rate=0.71) and landed on the last fully passing one ('a1b2c3d', rate=0.94).
Comparison result: {"baselineCommit":"a1b2c3d","baselineRate":0.94,"candidateRate":0.9,"dropPoints":4,"isRegression":true}
[VERIFIED] The candidate (90%) vs. the genuine baseline (94%) is correctly flagged as a regression (4 points, exceeds the 2-point tolerance).

Naive comparison (against the failing commit, not the real baseline): {"baselineCommit":"e4f5g6h","baselineRate":0.71,"candidateRate":0.9,"dropPoints":-19,"isRegression":false}
[CONFIRMED THE FAILURE MODE] Comparing against the most recent report... incorrectly shows NO regression.

[VERIFIED] A suite with zero fully passing history correctly reports no promotable baseline.
```

Every number matches Python exactly (`4` and `-19` drop points), confirming this is a genuinely deterministic algorithm ported faithfully - the correct bar for this category of lesson, same as Days 46, 49, and 55. `tsc --noEmit` and `oxlint` both clean with no fixes needed. `npm audit` unchanged.

---

## Best Practices

- **The failure-mode proof (Test 2) is language-agnostic and should port unchanged, because it's not testing anything AI-SDK- or Pydantic-specific - it's testing plain arithmetic and array logic.** Both ports reproduce the exact same -19-point false "improvement," confirming the danger this pattern guards against is a property of the ALGORITHM, not an artifact of either language's specific tooling.
- **This is the last of several "deterministic algorithm, exact cross-language match" lessons in this portfolio (Days 46, 49, 55).** Recognizing that category - no LLM call, fully reproducible output - is itself a useful skill: it tells you exactly how strict the verification bar should be (digit-for-digit, not just directional) before you even start porting.

## Why This Port Matters in Production

Closing this 56-day portfolio on a pattern that ports with EXACT numerical fidelity, alongside days like 47, 50, and 54 that found genuine, explainable cross-language DIFFERENCES, is itself the honest summary of what porting code between languages actually looks like in practice: some patterns are perfectly portable, some surface real architecture-dependent differences, and telling those two categories apart - rather than assuming every port should either match exactly or diverge - is the actual skill this whole exercise was meant to build.
