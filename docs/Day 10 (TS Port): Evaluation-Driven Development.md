This is Day 10's TypeScript side, and it starts with a real decision this lesson had to make differently from every prior lesson: the obvious library turned out to be unsafe to adopt right now.

---

## LLM Evaluation — Day 10 (TS Port): Evaluation-Driven Development (EDD)

### The Problem We're Solving

Same problem as the Python lesson: a model's output can't be tested with an exact string match, because the same correct idea gets phrased differently every run. The fix is the same "LLM-as-a-judge" idea - a second AI call scores the first AI's output against a plain-English criterion, with a threshold that turns the score into a pass/fail.

### A Real Decision: Why This Port Doesn't Use `deepeval`'s TypeScript Package

DeepEval does ship a TypeScript package (`npm install deepeval`, currently in beta). Installing it here surfaced a genuine, serious problem: it pulled in a **CRITICAL severity** remote-code-execution vulnerability (`protobufjs`, via its OpenTelemetry exporter dependency), and `npm audit fix` couldn't resolve it without breaking this project's other peer dependencies. DeepEval's own blog post about the TypeScript port also documents a real cross-language inconsistency: `AnswerRelevancyMetric`'s default threshold silently drifted to 0.5 in the TS port versus 0.7 in Python - the kind of subtle difference that could pass a test in one language and fail the "same" test in the other, unnoticed.

Given both issues, this lesson builds the underlying technique directly instead: a hand-rolled G-Eval-style judge using `generateObject`, with zero new dependencies and zero new vulnerabilities. This is honestly closer to what `deepeval` does internally anyway - G-Eval is fundamentally "ask a model to score another model's output against a criterion," not something that inherently needs a dedicated library.

Focus: the same LLM-as-a-judge technique, built directly with `generateObject` instead of a beta library
Time investment: 15 minutes (assuming Day 10's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the judge (`GEval(name="Architectural Rigor", criteria=..., threshold=0.7)` from deepeval) | the judge (`judgeAgainstCriterion({ criterion, input, actualOutput })`, a hand-built `generateObject` call) |
| the judge's score shape (built into deepeval's `GEval`) | the judge's score shape (`const JudgeScoreSchema = z.object({ score, reason })`) |
| the thing being judged (`LLMTestCase(input=..., actual_output=..., retrieval_context=...)`) | the thing being judged (`input: inputPrompt, actualOutput: actualAgentOutput`) |
| the pass/fail gate (`assert_test(test_case=..., metrics=[...])`) | the pass/fail gate (`result.score >= threshold`, then `process.exitCode = passed ? 0 : 1`) |
| running it (`deepeval test run tests/test_agent_evaluation.py`) | running it (`npx tsx tests/agent-evaluation.test.ts`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Test File

Inside `apps/web/tests/`, create:
`agent-evaluation.test.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const JudgeScoreSchema = z.object({
  score: z.number().min(0).max(1).describe("Quality score from 0 (fails the criterion) to 1 (fully satisfies it)."),
  reason: z.string().describe("A short explanation for the score, citing specifics from the output."),
});

async function judgeAgainstCriterion(params: {
  criterion: string;
  input: string;
  actualOutput: string;
}): Promise<{ score: number; reason: string }> {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: JudgeScoreSchema,
    system:
      "We are an impartial evaluator scoring an AI system's output against a specific quality criterion. " +
      "Be honest and critical - do not default to high scores.",
    prompt:
      `Criterion: ${params.criterion}\n\n` +
      `Input: ${params.input}\n\n` +
      `Actual Output: ${params.actualOutput}\n\n` +
      "Score how well the Actual Output satisfies the Criterion, from 0 to 1.",
  });
  return object;
}

async function testSovereignAgentOutputQuality(): Promise<boolean> {
  const inputPrompt = "How should we design type-safe agents in our Sovereign Intelligence Hub?";

  const actualAgentOutput =
    "We design type-safe agents by defining explicit Zod schemas and passing them into " +
    "generateObject. Dynamic state is scoped per-request instead of using global variables.";

  const threshold = 0.7;

  const result = await judgeAgainstCriterion({
    criterion: "Determine whether the answer recommends type-safe, production-ready engineering patterns.",
    input: inputPrompt,
    actualOutput: actualAgentOutput,
  });

  const passed = result.score >= threshold;

  console.log(`Architectural Rigor: score=${result.score.toFixed(2)}, threshold=${threshold}`);
  console.log(`Reason: ${result.reason}`);
  console.log(passed ? "PASS" : "FAIL");

  return passed;
}

async function main() {
  const passed = await testSovereignAgentOutputQuality();
  process.exitCode = passed ? 0 : 1;
}

main().catch(console.error);
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx tests/agent-evaluation.test.ts
```

Real evidence from running this 4 times in a row: every run scored **0.80**, all comfortably above the 0.7 threshold, with the judge's reasoning consistently flagging the same real gap each time (good use of Zod/scoped state, but missing detail on error handling, testing, and integration). That's meaningfully MORE stable than the Python lesson's own G-Eval metric, which ranged from 0.65 to 0.80 on an unchanged input across repeated runs.

*(Note: this doesn't mean the TypeScript version is inherently more reliable - it's a different judge prompt, a different criterion wording, and a small sample size on both sides. The honest takeaway is the SAME one as Python: run any new judge-based check multiple times before trusting a threshold near the edge, in either language.)*

---

## Best Practices

- **Check a library's actual dependency tree before adopting it, not just its README.** `deepeval`'s TypeScript package looked like the obvious choice by name alone; `npm install` completing without error said nothing about the critical vulnerability sitting one level down in its OpenTelemetry exporter dependency - only `npm audit` surfaced that.
- **A library's own blog post can be the best source for a real caveat.** DeepEval's own writeup about their TypeScript port explicitly documents the `AnswerRelevancyMetric` threshold drift between languages - reading the library author's own account of a rough edge is more reliable than assuming parity between a Python original and its TS port.
- **The underlying LLM-as-a-judge technique doesn't require a dedicated library.** A judge is just a second, separately-prompted AI call scoring output against a criterion - reachable directly with `generateObject` and a schema, with full control over the prompt and zero extra dependency risk.

## Why This Matters in Production

Sometimes the "TypeScript port" of a Python tool genuinely isn't ready for production use yet, and the right call is recognizing that early rather than working around vulnerabilities after the fact. The underlying evaluation technique - a second AI call as judge - ported perfectly fine on its own; it's the specific packaging of that technique that needed a second look before adopting it.

## Density Add-On: The Four Eval Families

To make this lesson denser, split evaluation into four families.

1. Retrieval eval (did we gather the right context?)
2. Answer eval (is the answer correct and useful?)
3. Tool-use eval (did we choose the correct tool and safe inputs?)
4. Trace eval (did policy and execution stages follow the expected path?)

Why this helps: if a run fails, you can see the first broken layer instead of guessing.

Practice checkpoint
- Add one TypeScript check per family on top of this judge test.
- Print family-level pass/fail and one short reason per family.

Common mistake box
- Mistake: using one total score as the only release signal.
- Fix: store family-level outcomes so CI can report root cause directly.
