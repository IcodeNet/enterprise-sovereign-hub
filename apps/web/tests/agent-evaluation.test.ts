import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// A hand-rolled G-Eval-style judge: rather than checking for an exact
// string match (useless against a model that phrases the same correct
// idea differently every run), a SECOND AI call reads a plain-English
// criterion plus the actual input/output and scores how well the output
// satisfies it. This is Day 9's Worker/Auditor pattern, applied to grading
// test results instead of grading generated code - and it's genuinely
// the same underlying technique real "LLM-as-a-judge" libraries use
// internally, just without an extra dependency.
const JudgeScoreSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Quality score from 0 (fails the criterion) to 1 (fully satisfies it)."),
  reason: z
    .string()
    .describe("A short explanation for the score, citing specifics from the output."),
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

// A test-shaped function, deliberately kept framework-free (no vitest/jest)
// so this lesson has zero new dependencies - the SAME script can be run
// directly, or wrapped in whatever test runner a real project already uses.
async function testSovereignAgentOutputQuality(): Promise<boolean> {
  const inputPrompt = "How should we design type-safe agents in our Sovereign Intelligence Hub?";

  // The answer we're checking - standing in for whatever our real agent
  // pipeline actually produced for this same question.
  const actualAgentOutput =
    "We design type-safe agents by defining explicit Zod schemas and passing them into " +
    "generateObject. Dynamic state is scoped per-request instead of using global variables.";

  const threshold = 0.7; // See the note on judge score variance in the Day 10 doc before raising this

  const result = await judgeAgainstCriterion({
    criterion:
      "Determine whether the answer recommends type-safe, production-ready engineering patterns.",
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
