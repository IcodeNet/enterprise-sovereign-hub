import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * CI/CD regression gate suite - Day 25 TS port.
 *
 * DeepEval (the Python library used on the Python side of this day) ships an
 * official TypeScript SDK, but installing it pulled in a transitive
 * `protobufjs` dependency with a CRITICAL npm audit finding (arbitrary code
 * execution / prototype pollution, unrelated to anything this repo actually
 * uses from the package). Rather than ship that into a portfolio repo, this
 * is hand-rolled with the same LLM-as-a-judge pattern already proven on Day
 * 19's agent-evaluator.ts - a target agent's answer against a fixed
 * benchmark dataset, scored by a judge model, with a hard threshold that
 * fails the process (and therefore the CI job) when quality drops.
 */

const JudgeScoreSchema = z.object({
  score: z.number().min(0).max(1).describe("Overall quality score from 0.0 to 1.0."),
  reason: z.string().describe("Plain-English justification for the score."),
});

interface BenchmarkCase {
  input: string;
  actualOutput: string;
  context: string[];
}

const BENCHMARK_DATASET: BenchmarkCase[] = [
  {
    input: "How do we pass runtime database dependencies to Pydantic AI agents?",
    actualOutput:
      "We use the deps_type parameter on the Agent and access dependencies dynamically " +
      "inside tools using RunContext[DatabaseDeps] without global state.",
    context: [
      "Pydantic AI allows dependency injection via deps_type and RunContext.",
      "Global variables should be avoided in production agent services.",
    ],
  },
  {
    input: "How does our hybrid vector search merge BM25 and semantic embeddings?",
    actualOutput:
      "Our hybrid search engine queries Qdrant using dense OpenAI embeddings alongside " +
      "sparse BM25 token vectors, combining them via Reciprocal Rank Fusion (RRF).",
    context: [
      "Qdrant supports dense and sparse vectors simultaneously.",
      "Reciprocal Rank Fusion merges rankings from multiple retrieval algorithms.",
    ],
  },
];

const QUALITY_THRESHOLD = 0.5;

async function judgeCase(testCase: BenchmarkCase) {
  const judgePrompt =
    `Question: ${testCase.input}\n` +
    `Answer: ${testCase.actualOutput}\n` +
    `Reference context: ${testCase.context.join(" ")}\n\n` +
    "Score whether the answer gives a technically accurate, specific response that " +
    "correctly explains the relevant architecture, grounded in the reference context, " +
    "without vague or generic filler.";

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: JudgeScoreSchema,
    system: "We are a strict technical quality judge for a CI/CD regression gate.",
    prompt: judgePrompt,
  });
  return object;
}

async function runRegressionGate(): Promise<boolean> {
  let allPassed = true;

  for (const testCase of BENCHMARK_DATASET) {
    const result = await judgeCase(testCase);
    const passed = result.score >= QUALITY_THRESHOLD;
    allPassed = allPassed && passed;

    console.log(`\n[${passed ? "PASS" : "FAIL"}] "${testCase.input}"`);
    console.log(`  Score: ${result.score.toFixed(2)} (threshold: ${QUALITY_THRESHOLD})`);
    console.log(`  Reason: ${result.reason}`);
  }

  return allPassed;
}

runRegressionGate()
  .then((allPassed) => {
    if (!allPassed) {
      console.error(
        "\nRegression gate FAILED - at least one benchmark case dropped below threshold.",
      );
      process.exit(1);
    }
    console.log("\nRegression gate PASSED - all benchmark cases met threshold.");
  })
  .catch((error) => {
    console.error("Regression gate errored:", error);
    process.exit(1);
  });
