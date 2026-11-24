This is Day 19's TypeScript side - same target/judge evaluation pattern, and a genuinely different judge verdict than the Python lesson found on its own (different) question, worth comparing honestly rather than assuming judges behave identically.

---

## LLM Evaluation — Day 19 (TS Port): LLM-as-a-Judge Benchmarking

### The Problem We're Solving

Same problem as the Python lesson: grade an AI's free-form technical recommendation automatically using a second, stronger AI model against an explicit rubric, rather than a useless string-equality check.

**A real, honest cross-language observation**: this port's judge, evaluating a TypeScript dependency-injection question, scored the target agent's answer consistently HIGH (8-9/10 accuracy, `isProductionReady: true`) across 3 runs - the opposite verdict direction from the Python lesson's judge, which consistently scored its (different) question LOW (4-6/10, `is_production_ready: false`). This is NOT evidence of a bug in either side - the two lessons ask genuinely different questions, so a different verdict is expected. What IS worth noting: within each language's own repeated runs, the VERDICT was stable even though the exact numeric score moved slightly - the same stability Python's lesson found.

Focus: the same target/judge evaluation pattern, with an honest side-by-side verdict comparison against the Python run
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the answer being graded (`class SystemArchitectureProposal(BaseModel)`) | the answer being graded (`const SystemArchitectureProposalSchema = z.object({...})`) |
| the judge's score sheet (`class EvaluationRubricScore(BaseModel)`) | the judge's score sheet (`const EvaluationRubricScoreSchema = z.object({...})`) |
| getting the candidate answer (`await target_agent.run(test_prompt)`) | getting the candidate answer (`await generateObject({ model: openai("gpt-4o-mini"), schema: SystemArchitectureProposalSchema, ... })`) |
| asking the judge (`await judge_agent.run(judge_input)`) | asking the judge (`await generateObject({ model: openai("gpt-4o"), schema: EvaluationRubricScoreSchema, prompt: judgeInput })`) |
| reading the scores (`score_data.accuracy_score`, `score_data.is_production_ready`) | reading the scores (`scoreData.accuracyScore`, `scoreData.isProductionReady`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/evals/`, create:
`agent-evaluator.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const SystemArchitectureProposalSchema = z.object({
  title: z.string().describe("Title of the recommended system component."),
  recommendation: z.string().describe("Detailed engineering recommendation."),
});

const EvaluationRubricScoreSchema = z.object({
  accuracyScore: z.number().describe("Score from 1 to 10 measuring technical precision."),
  clarityScore: z.number().describe("Score from 1 to 10 evaluating plain English clarity."),
  isProductionReady: z.boolean().describe("True if recommendation meets enterprise standards."),
  detailedJustification: z.string().describe("Explanation for assigned rubric scores."),
});

async function runEvaluationBenchmark(testPrompt: string) {
  console.log("Step 1: Running Target Agent to generate candidate response...");

  const { object: candidateData } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SystemArchitectureProposalSchema,
    system: "We are an AI software engineer suggesting architectural patterns.",
    prompt: testPrompt,
  });

  console.log("\n--- Target Agent Output Generated ---");
  console.log(`Title: ${candidateData.title}`);
  console.log(`Proposal: ${candidateData.recommendation.slice(0, 120)}...`);

  console.log("\nStep 2: Dispatching candidate output to LLM-as-a-Judge Evaluator...");
  const judgeInput =
    `Original User Prompt: ${testPrompt}\n` +
    `Candidate Proposal Title: ${candidateData.title}\n` +
    `Candidate Recommendation: ${candidateData.recommendation}`;

  const { object: scoreData } = await generateObject({
    model: openai("gpt-4o"),
    schema: EvaluationRubricScoreSchema,
    system:
      "We are a principal AI systems auditor acting as an LLM-as-a-Judge evaluator. " +
      "Evaluate candidate proposals stringently based on technical correctness and enterprise readiness.",
    prompt: judgeInput,
  });

  console.log("\n--- Evaluation Benchmark Complete ---");
  console.log(`Technical Accuracy Score: ${scoreData.accuracyScore}/10`);
  console.log(`Clarity Score: ${scoreData.clarityScore}/10`);
  console.log(`Production Ready: ${scoreData.isProductionReady}`);
  console.log(`Judge Justification: ${scoreData.detailedJustification}`);

  return scoreData;
}

const benchmarkPrompt =
  "Explain how to implement dynamic dependency injection in the Vercel AI SDK without global variables.";
runEvaluationBenchmark(benchmarkPrompt).catch(console.error);
```

### Step 4: Run and Verify - Compared Honestly Against the Python Run

```bash
cd apps/web
npx tsx src/evals/agent-evaluator.ts
```

| Run | Accuracy | Clarity | Production Ready |
|---|---|---|---|
| 1 | 8/10 | 9/10 | true |
| 2 | 8/10 | 9/10 | true |
| 3 | 8/10 | 8/10 | true |

Side by side with Python's own repeated runs (different question, same rubric shape):

| Lesson | Question topic | Accuracy range | Verdict stability |
|---|---|---|---|
| Python | Pydantic AI dependency injection | 4-6/10 | Stable `False` all 3 runs |
| TypeScript | Vercel AI SDK dependency injection | 8-8/10 to 9/10 | Stable `True` all 3 runs |

The exact numeric score moved slightly within each language's own runs, but the pass/fail VERDICT held steady within each - consistent with Python's finding that verdict stability matters more than exact-score stability.

---

## Best Practices

- **Don't expect two different judge questions to produce the same verdict - that's not what "consistency" means here.** The two lessons compare within-language run-to-run stability, not cross-question agreement; a different question legitimately deserves a different score.
- **A judge's verdict can differ meaningfully depending on the specific target framework being evaluated**, even when asking a structurally identical question about a different but analogous library - a real reason not to assume an eval harness "transfers" its calibration from one domain to another without re-checking.
- **Report the real numbers from BOTH sides when porting an evaluation lesson, even if they point in different directions** - the honest comparison here (one judge lenient, one strict) is more useful evidence than silently only showing the number that happens to look better.

## Why This Matters in Production

An LLM-as-a-Judge harness's calibration (how harsh or lenient it is) can genuinely differ by question domain, not just by chance - this cross-language comparison is real evidence that a judge tuned or validated on one kind of question shouldn't be assumed to carry the same strictness to a different one without separately checking.

## Density Add-On: Four Eval Families for TS Benchmarks

Use this judge as one layer in a four-family benchmark model.

1. Retrieval eval: confirm the context set matches the question.
2. Answer eval: keep this existing judge rubric.
3. Tool-use eval: check tool choice, arguments, and policy fit.
4. Trace eval: verify stage order and fallback behavior.

Why this helps: stable verdicts are good, but family labels show where to improve.

Practice checkpoint
- Add one extra TS assertion per family.
- Fail the run with a family-specific message, not a generic error.

Common mistake box
- Mistake: assuming two frameworks with similar prompts should produce identical judge behavior.
- Fix: calibrate each family per framework and keep thresholds local to the dataset.
