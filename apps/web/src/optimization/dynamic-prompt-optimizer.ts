import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, generateObject } from "ai";
import { z } from "zod";

/**
 * Dynamic few-shot prompt calibration - Day 31 TS port.
 *
 * Uses the Vercel AI SDK's own embed()/cosineSimilarity() exports, same as
 * Day 28's memory store port - a real ecosystem advantage over the Python
 * side's hand-rolled cosine math.
 */

const OptimizedArchitectureSolutionSchema = z.object({
  taskName: z.string().describe("Name of the solved engineering requirement."),
  patternUsed: z.string().describe("Architecture pattern applied."),
  implementationSummary: z.string().describe("Clean, type-safe explanation."),
});

interface FewShotExample {
  taskCategory: string;
  sampleInput: string;
  sampleOutput: string;
  embedding: number[];
}

class DynamicExampleSelector {
  private examples: FewShotExample[] = [];

  private async embedText(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.textEmbedding("text-embedding-3-small"),
      value: text,
    });
    return embedding;
  }

  async addExample(taskCategory: string, sampleInput: string, sampleOutput: string): Promise<void> {
    const embedding = await this.embedText(sampleInput);
    this.examples.push({ taskCategory, sampleInput, sampleOutput, embedding });
  }

  async selectTopK(query: string, k = 2): Promise<string> {
    if (this.examples.length === 0) return "No few-shot demonstrations available.";

    const queryEmbedding = await this.embedText(query);
    const scored = this.examples.map((ex) => ({
      score: cosineSimilarity(queryEmbedding, ex.embedding),
      example: ex,
    }));
    scored.sort((a, b) => b.score - a.score);
    const topExamples = scored.slice(0, k).map((s) => s.example);

    return topExamples
      .map(
        (ex, idx) =>
          `--- Demonstration ${idx + 1} (${ex.taskCategory}) ---\nInput: ${ex.sampleInput}\nOutput: ${ex.sampleOutput}`,
      )
      .join("\n");
  }
}

async function runCalibratedPipeline(userPrompt: string) {
  const selector = new DynamicExampleSelector();

  console.log("Step 1: Populating golden few-shot example store...");
  await selector.addExample(
    "State Management",
    "How do we manage state across long-running async agents?",
    "Use LangGraph or DBOS durable execution with state checkpointing to Postgres.",
  );
  await selector.addExample(
    "Type Safety",
    "How do we ensure LLM outputs match strict TypeScript schemas?",
    "Use Pydantic AI with response_model enforcement or Vercel AI SDK generateObject.",
  );
  await selector.addExample(
    "Search Retrieval",
    "How do we retrieve both exact IDs and semantic context?",
    "Use Qdrant hybrid search combining BM25 sparse vectors and dense OpenAI embeddings via RRF.",
  );

  console.log(
    `\nStep 2: Dynamically retrieving top matching demonstrations for: '${userPrompt}'...`,
  );
  const relevantExamples = await selector.selectTopK(userPrompt, 1);
  console.log(`Selected Demonstration:\n${relevantExamples}`);

  console.log("Step 3: Running calibrated agent execution...");
  const fullPrompt = `${relevantExamples}\n\nTask to solve:\n${userPrompt}`;
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: OptimizedArchitectureSolutionSchema,
    system:
      "We are a principal AI software architect. Analyze the task carefully and match the " +
      "structural style demonstrated in the provided few-shot examples.",
    prompt: fullPrompt,
  });

  return object;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const task =
    "We need our Python agent service to output strictly typed JSON for our Next.js frontend.";
  runCalibratedPipeline(task)
    .then((solution) => {
      console.log("\n=== Optimized Agent Output ===");
      console.log(`Task: ${solution.taskName}`);
      console.log(`Pattern: ${solution.patternUsed}`);
      console.log(`Implementation: ${solution.implementationSummary}`);
    })
    .catch(console.error);
}
