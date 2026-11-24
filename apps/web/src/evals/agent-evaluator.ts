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
