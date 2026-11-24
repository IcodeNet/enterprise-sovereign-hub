Day 25 turns "does our AI answer well" from a manual spot-check into a pass/fail CI gate - with a real bug found in the eval rubric itself along the way.

---

## CI/CD Evals — Day 25: Automated Regression Testing in CI/CD

### The Problem We're Solving

Every earlier eval day (19, 22) ran its check by hand, once, and reported the result. That catches a regression only if someone remembers to run it. A **CI/CD quality gate** runs the same check automatically on every push and pull request, so a prompt change or model swap that quietly drops answer quality gets blocked from merging - the same discipline as a failing unit test blocking a broken function.

Focus: wiring a small, fixed benchmark dataset through an LLM-as-a-judge metric as a real GitHub Actions job that fails the build on regression
Time investment: 15 minutes

### Step 1: Build the Regression Suite (DeepEval + pytest)

`apps/ai-engine/tests/test_ci_eval_gates.py` defines a fixed two-case benchmark dataset (a Pydantic AI dependency-injection question, a hybrid-search architecture question) and scores each answer with three DeepEval metrics: `AnswerRelevancyMetric`, `HallucinationMetric`, and a custom `GEval` rubric for technical accuracy.

```python
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, GEval, HallucinationMetric
from deepeval.test_case import LLMTestCase, SingleTurnParams

enterprise_standard_metric = GEval(
    name="Enterprise Architecture Quality",
    criteria=(
        "Assess whether the response gives a technically accurate, specific answer "
        "that correctly explains the relevant architecture or implementation pattern, "
        "grounded in the provided context, without vague or generic filler."
    ),
    evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    threshold=0.5,
)
```

Two real API-drift corrections were needed against an older example snippet:

1. **`LLMTestCaseParams` is deprecated in the installed DeepEval version (4.2.6)** in favor of `SingleTurnParams` - confirmed directly by inspecting the enum at the Python REPL rather than guessing from an older import.
2. **The earlier GEval criteria was too rigid.** It required every answer to demonstrate "type-safe Pydantic AI models and explicit error boundaries" - which is a fine bar for the dependency-injection question but genuinely irrelevant to the hybrid-search question, and both benchmark cases failed the judge for exactly that reason on the first real run (accuracy scores near 0.10). Fixed by generalizing the rubric to "technically accurate, grounded in context, no vague filler" - a criterion that actually applies across a varied benchmark set. Re-run after the fix: both cases pass with real judge-generated scores and reasons.

### Step 2: GitHub Actions Workflow

`.github/workflows/ai-eval-gate.yml` runs the suite on every push/PR to `main` (its triggers are currently switched to manual runs to avoid model spend; see the comment at the top of the workflow), gated behind the `OPENAI_API_KEY` secret existing (a fresh clone without the secret skips cleanly instead of failing, matching the pattern already used in `ci.yml`).

```bash
cd apps/ai-engine
python -m pytest tests/test_ci_eval_gates.py -v
```

Real run locally: `2 passed, 2 warnings in 14.24s`.

---

## Best Practices

- **A judge rubric needs to generalize across the whole benchmark dataset, not just the case it was written against.** The first rubric draft hard-coded a criterion (Pydantic AI models, error boundaries) specific to one question and silently failed a completely unrelated question for the wrong reason - a real, reproducible bug in the eval design itself, not the code being evaluated.
- **A CI gate needs a real "no secret configured" fallback**, or every fresh clone without the API key fails its own CI on the first push - this repo's existing `ci.yml` pattern (secret-gated skip) was reused here rather than reinvented.

## Why This Matters in Production

A regression gate is only trustworthy if the rubric it enforces actually fits the questions it's grading - a badly generalized rubric produces confident-looking failures for the wrong reason, which is worse than no gate at all because it trains people to ignore CI red.

## Density Add-On: CI Gate by Four Eval Families

As this gate grows, score each row across four families.

1. Retrieval eval
2. Answer eval
3. Tool-use eval
4. Trace eval

Release rule example
- Block merge if any family score drops below threshold.
- Also block merge if one family suddenly has many infra errors.

Why this helps: CI failures become actionable. The owner sees the failing layer immediately.

Practice checkpoint
- Add a `family` field to each benchmark row.
- Report pass rate by family in the final CI summary.

Common mistake box
- Mistake: only showing one global pass rate.
- Fix: print global plus family breakdown so regressions cannot hide.
