import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

const LocalAnalysisResultSchema = z.object({
  taskName: z.string().describe("Name of the analyzed local task."),
  costSavingsGbp: z.number().describe("Estimated daily API cost savings in GBP."),
  executionVerdict: z.string().describe("Recommendation for cloud vs local execution."),
});

type LocalAnalysisResult = z.infer<typeof LocalAnalysisResultSchema>;

// Ollama serves an OpenAI-compatible API on localhost - @ai-sdk/openai-
// compatible is the generic Vercel AI SDK provider for exactly this case
// (any server that speaks the OpenAI chat-completions shape), rather than
// something Ollama-specific.
const ollamaProvider = createOpenAICompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama", // Dummy key required by the OpenAI client protocol; Ollama ignores it.
});

async function runLocalInference(queryText: string): Promise<LocalAnalysisResult> {
  console.log("Executing query on local open-weight model (qwen2.5-coder:7b via Ollama)...");

  try {
    const { object } = await generateObject({
      model: ollamaProvider("qwen2.5-coder:7b"),
      schema: LocalAnalysisResultSchema,
      temperature: 0,
      system:
        "We are a principal inference engineer. " +
        "Analyze queries and evaluate the cost benefits of local vs cloud execution. " +
        "Respond with ONLY a single flat JSON object with EXACTLY these three keys, no nesting, " +
        'no comments, no extra keys: {"taskName": string, "costSavingsGbp": number, "executionVerdict": string}.',
      prompt: queryText,
    });

    console.log("\n--- Local Inference Result Received ---");
    console.log(`Task Name: ${object.taskName}`);
    console.log(`Estimated Savings: £${object.costSavingsGbp.toFixed(2)}/day`);
    console.log(`Verdict: ${object.executionVerdict}`);
    return object;
  } catch (error) {
    console.log(`\n[LOCAL INFERENCE ERROR]: Ensure Ollama is running locally. Error -> ${error}`);
    throw error;
  }
}

const testQuery =
  "Evaluate running 10,000 daily validation tasks locally instead of using cloud APIs.";
runLocalInference(testQuery).catch(console.error);
