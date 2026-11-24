Day 19 is about grading an AI's output automatically with a SECOND AI acting as a judge - and the same score-variance discipline Day 10 established, now applied to a hand-rolled rubric rather than a dedicated eval library.

---

## LLM Evaluation — Day 19: LLM-as-a-Judge Benchmarking

### The Problem We're Solving

A traditional unit test checks for exact string equality - useless for grading an AI's free-form technical recommendation, where there's no single "correct" string to match against. **LLM-as-a-Judge** solves this by using a SEPARATE, usually stronger AI model to grade the first model's output against an explicit, type-safe rubric (accuracy, clarity, production-readiness) - the same target/judge split Day 10 used with the `deepeval` library, built here from plain `pydantic-ai` agents for a case simple enough not to need a dedicated eval framework.

Focus: constructing a type-safe, automated evaluation harness that grades an agent's output against an explicit rubric
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/evals/`, create:
`agent_evaluator.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class SystemArchitectureProposal(BaseModel):
    title: str = Field(description="Title of the recommended system component.")
    recommendation: str = Field(description="Detailed engineering recommendation.")


class EvaluationRubricScore(BaseModel):
    accuracy_score: int = Field(description="Score from 1 to 10 measuring technical precision.")
    clarity_score: int = Field(description="Score from 1 to 10 evaluating plain English clarity.")
    is_production_ready: bool = Field(description="True if recommendation meets enterprise standards.")
    detailed_justification: str = Field(description="Explanation for assigned rubric scores.")


target_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=SystemArchitectureProposal,
    system_prompt="We are an AI software engineer suggesting architectural patterns.",
)

judge_agent = Agent(
    "openai:gpt-4o",
    output_type=EvaluationRubricScore,
    system_prompt=(
        "We are a principal AI systems auditor acting as an LLM-as-a-Judge evaluator. "
        "Evaluate candidate proposals stringently based on technical correctness and enterprise readiness."
    ),
)


async def run_evaluation_benchmark(test_prompt: str) -> EvaluationRubricScore:
    print("Step 1: Running Target Agent to generate candidate response...")
    agent_response = await target_agent.run(test_prompt)
    candidate_data: SystemArchitectureProposal = agent_response.output

    print("\n--- Target Agent Output Generated ---")
    print(f"Title: {candidate_data.title}")
    print(f"Proposal: {candidate_data.recommendation[:120]}...")

    print("\nStep 2: Dispatching candidate output to LLM-as-a-Judge Evaluator...")
    judge_input = (
        f"Original User Prompt: {test_prompt}\n"
        f"Candidate Proposal Title: {candidate_data.title}\n"
        f"Candidate Recommendation: {candidate_data.recommendation}"
    )

    evaluation_response = await judge_agent.run(judge_input)
    score_data: EvaluationRubricScore = evaluation_response.output

    print("\n--- Evaluation Benchmark Complete ---")
    print(f"Technical Accuracy Score: {score_data.accuracy_score}/10")
    print(f"Clarity Score: {score_data.clarity_score}/10")
    print(f"Production Ready: {score_data.is_production_ready}")
    print(f"Judge Justification: {score_data.detailed_justification}")

    return score_data


if __name__ == "__main__":
    benchmark_prompt = "Explain how to implement dynamic dependency injection in Pydantic AI without global variables."
    asyncio.run(run_evaluation_benchmark(benchmark_prompt))
```

### Step 4: Run and Verify - the Same Score-Variance Discipline as Day 10

```bash
python src/evals/agent_evaluator.py
```

Running it 3 times against the same prompt (same discipline as Day 10's repeated-run methodology, generalized in that day's doc as a production-system lesson):

| Run | Accuracy | Clarity | Production Ready |
|---|---|---|---|
| 1 | 4/10 | 6/10 | False |
| 2 | 6/10 | 7/10 | False |
| 3 | 6/10 | 7/10 | False |

Real, consistent variance in the accuracy score (4-6/10), but a STABLE overall verdict (`Production Ready: False` all 3 times) - the judge was harsher than the TypeScript port's judge turned out to be on its own (different) question, see the TS doc for that comparison.

---

## Best Practices

- **Run an LLM-as-a-Judge evaluation more than once before trusting a single score.** Day 10 already established this; this lesson's own repeated runs (4, 6, 6 out of 10) confirm it generalizes beyond `deepeval`'s specific metrics to a hand-rolled rubric too.
- **A stable pass/fail VERDICT across runs matters more than a stable numeric score.** The exact accuracy number moved between runs, but the boolean `is_production_ready` didn't - for a gating decision, that stability is usually what actually matters.
- **Build a hand-rolled judge (plain pydantic-ai agents) instead of reaching for a full eval framework when the rubric is simple** - Day 10 needed `deepeval`'s specific metrics (faithfulness, relevancy); this lesson's rubric is simple enough that two agents and a Pydantic schema are the whole implementation, with no extra dependency.

## Why This Matters in Production

An LLM-as-a-Judge harness turns "does this AI's free-form output look good" from a subjective judgment call into a repeatable, type-safe, automatable check - but only if its score variance is understood and accounted for, not assumed away. A single run's score is a sample, not a verdict.

## Why This Matters in Production

An LLM-as-a-Judge harness turns "does this AI's free-form output look good" from a subjective judgment call into a repeatable, type-safe, automatable check - but only if its score variance is understood and accounted for, not assumed away. A single run's score is a sample, not a verdict. And before that judge is trusted to gate anything real, its own agreement with a human's judgment needs to be measured, not assumed.

## Density Add-On: Map This Judge to Four Eval Families

This lesson focuses on answer judging. For production depth, connect it to four eval families.

1. Retrieval eval: was the evidence set complete and relevant?
2. Answer eval: did the proposal stay correct and clear?
3. Tool-use eval: were tool calls and arguments valid for policy?
4. Trace eval: did the request flow follow the expected stage path?

Why this helps: the judge score tells quality, but the family map tells failure location.

Practice checkpoint
- Keep this judge rubric, then add a tiny companion check for each missing family.
- Record which family failed first in each run.

Common mistake box
- Mistake: treating low answer score as always a model problem.
- Fix: check retrieval and tool-use families first; answer quality can fail because of upstream issues.
