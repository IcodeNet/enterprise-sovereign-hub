Day 10 is about turning "does this AI output sound reasonable?" into an actual pass/fail check a CI pipeline can gate on - and being honest about where that check can still surprise you.

---

## LLM Evaluation — Day 10: Evaluation-Driven Development (EDD)

### The Problem We're Solving

A traditional unit test checks for an exact match - `assert result == 4`. That doesn't work against a language model: ask the same question twice and you'll get two different, both-correct phrasings of the same answer. A test that demands an exact string match would fail a genuinely correct answer just for being worded differently.

Evaluation-Driven Development treats a model's output quality as something to be *measured*, not matched exactly. DeepEval (a real testing library, not a metaphor) gives you:
- **Built-in metrics** like `FaithfulnessMetric` (does the output stick to the retrieved facts, without inventing things?) and `AnswerRelevancyMetric` (does the output actually address what was asked?).
- **G-Eval**, a "LLM-as-a-judge" metric: you write a plain-English criterion, and a SECOND AI call reads the input and output and scores how well the criterion was satisfied - the same Worker/Auditor idea from Day 9, applied to grading test results.

Each metric has a **threshold**. `assert_test` fails the test (exactly like any other pytest assertion) if any metric's score comes in below its threshold - that's what turns "sounds reasonable" into an actual CI gate.

Focus: writing a pytest-native quality gate using a built-in RAG metric and a custom G-Eval judge
Time investment: 15 minutes

### Step 1: Install DeepEval

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install deepeval pytest
```

### Step 2: Create the Test File

Inside `apps/ai-engine/tests/`, create:
`test_agent_evaluation.py`

### Step 3: Add the Source Code

```python
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric, GEval
from deepeval.test_case import LLMTestCase, SingleTurnParams
from deepeval.test_case.llm_test_case import RetrievedContextData

architecture_quality_metric = GEval(
    name="Architectural Rigor",
    criteria="Determine whether the answer recommends type-safe, production-ready engineering patterns.",
    evaluation_params=[
        SingleTurnParams.INPUT,
        SingleTurnParams.ACTUAL_OUTPUT,
    ],
    threshold=0.7,  # See the note on judge score variance below before raising this
)

faithfulness_metric = FaithfulnessMetric(threshold=0.8)
relevancy_metric = AnswerRelevancyMetric(threshold=0.8)


def test_sovereign_agent_output_quality():
    input_prompt = "How should we design type-safe agents in our Sovereign Intelligence Hub?"

    retrieved_context: list[str | RetrievedContextData] = [
        "Pydantic AI provides strict schema enforcement using Pydantic models to parse output data.",
        "Agent dependencies are injected dynamically via RunContext without global variable state.",
    ]

    actual_agent_output = (
        "We design type-safe agents by defining explicit Pydantic response models and "
        "passing them into Pydantic AI. Dynamic state is passed using RunContext instead of global state."
    )

    test_case = LLMTestCase(
        input=input_prompt,
        actual_output=actual_agent_output,
        retrieval_context=retrieved_context,
    )

    assert_test(
        test_case=test_case,
        metrics=[faithfulness_metric, relevancy_metric, architecture_quality_metric],
    )
```

*(Note: an earlier lesson draft used a deprecated import, `LLMTestCaseParams`. This lesson uses its replacement, `SingleTurnParams`, which is what the currently installed `deepeval` version actually expects.)*

### Step 4: Run the Evaluation Test Suite

```bash
deepeval test run tests/test_agent_evaluation.py
```

deepeval runs the judge model, prints its full written reasoning for each metric, and reports a pass/fail summary - a real run showed **Pass Rate: 100.0%**, with the G-Eval judge explaining its reasoning in detail ("directly supports type safety through structured schemas and validation... improving maintainability and production readiness").

### A Real, Honest Finding: G-Eval Scores Are Not Perfectly Stable

Running the exact same test again, unchanged, with plain `pytest` instead of the `deepeval test run` wrapper, produced a genuine **FAILURE** - the same `Architectural Rigor` G-Eval metric scored **0.716** against its original 0.8 threshold, just below the line. Running it five more times at a 0.7 threshold produced scores of 0.785, 0.798, 0.717, 0.65, and three clean passes - a real, measured spread of roughly 0.65 to 0.80 on the exact same fixed input and output.

This isn't a bug in this lesson's code - it's the nature of LLM-as-a-judge scoring: the judge is itself a language model, and language models aren't perfectly deterministic even at the same settings. The practical lesson: **a G-Eval threshold sitting right at the edge of the judge's natural score range will flip pass/fail from run to run**, which is a real, sharp-edged problem for any CI pipeline that gates a deploy on it. Setting the threshold with real headroom below the typical passing score (here, 0.7 rather than 0.8) is a genuine mitigation, not a guarantee - it reduces how often the boundary gets crossed by chance, but doesn't eliminate the underlying variance.

---

## Best Practices

- **Run any new G-Eval threshold multiple times before trusting it, not once.** A single passing run tells you almost nothing about how close to the edge that pass actually was - the honest test above only surfaced a real problem because it was run five times, not once.
- **Give threshold headroom below the typical score, don't set it right at the boundary.** A metric that usually scores around 0.8 but sometimes dips to 0.65 needs a threshold with real margin (0.7, not 0.8) to avoid flaky CI failures on unchanged code.
- **Use `deepeval test run` for the full experience (reasoning printed, nice summary), but know plain `pytest` runs the exact same assertions.** Both call the same `assert_test` under the hood - the difference is purely in how much detail gets printed, not in what's actually being checked.

## Why This Matters in Production

Evaluation-Driven Development turns "the AI's answer looked fine to me" into an actual, repeatable, CI-gateable check - the same kind of confidence a normal unit test suite gives us, adapted for outputs that are correct in more than one exact wording. But the honest finding above matters just as much as the pattern itself: an LLM-as-a-judge gate that flips pass/fail on unchanged code, right when a real deploy is waiting on it, is a real production risk worth designing around deliberately - not something to discover for the first time in a live incident.

## Density Add-On: The Four Eval Families

When you design a stronger eval gate, split checks into four families.

1. Retrieval eval (did we fetch the right evidence?)
2. Answer eval (is the answer correct and clear?)
3. Tool-use eval (did we call the right tool with safe arguments?)
4. Trace eval (did the run follow the expected policy and stage path?)

Why this helps: one blended score can hide root cause. Four family scores show where failure started.

Practice checkpoint
- Take this lesson's test case and add one extra check for each family.
- Keep each check small and explicit.
- Write one line for "what failed first" when a run fails.

Common mistake box
- Mistake: treating one judge score as full coverage.
- Fix: store family-level scores and fail reasons separately.
