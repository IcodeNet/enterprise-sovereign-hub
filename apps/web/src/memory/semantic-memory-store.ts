import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Long-term semantic memory store - Day 28 TS port.
 *
 * Uses the Vercel AI SDK's own `embed()` and `cosineSimilarity()` exports
 * instead of hand-rolling the vector math (a real ecosystem win over the
 * Python side, which has no equivalent built into pydantic-ai and has to
 * compute cosine similarity by hand).
 */

interface MemoryItem {
  sessionId: string;
  fact: string;
  embedding: number[];
}

class SemanticMemoryStore {
  private records: MemoryItem[] = [];

  /**
   * 0.75 (the PDF's original Python threshold) never actually fires for
   * text-embedding-3-small - measured directly on the Python side, real
   * cosine scores for genuinely relevant short facts land around
   * 0.45-0.55. 0.35 is calibrated against that measurement, not guessed,
   * and the TS side uses the same OpenAI embedding model so the same
   * threshold applies here too.
   */
  constructor(private readonly similarityThreshold = 0.35) {}

  private async embedText(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.textEmbedding("text-embedding-3-small"),
      value: text,
    });
    return embedding;
  }

  async saveFact(sessionId: string, fact: string): Promise<void> {
    const embedding = await this.embedText(fact);
    this.records.push({ sessionId, fact, embedding });
    console.log(` [MEMORY STORED] '${fact}' (Session: ${sessionId})`);
  }

  async recall(query: string, limit = 3): Promise<string[]> {
    if (this.records.length === 0) return [];

    const queryEmbedding = await this.embedText(query);
    const scored = this.records.map((item) => ({
      score: cosineSimilarity(queryEmbedding, item.embedding),
      fact: item.fact,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter((item) => item.score >= this.similarityThreshold)
      .slice(0, limit)
      .map((item) => item.fact);
  }
}

async function runMemoryDemo(): Promise<void> {
  const store = new SemanticMemoryStore();

  console.log("--- Session 1: Storing Past Facts ---");
  await store.saveFact(
    "session_001",
    "The team uses Pydantic AI with Azure Container Apps for hosting.",
  );
  await store.saveFact(
    "session_001",
    "Our target database is Postgres with Qdrant for vector search.",
  );
  await store.saveFact("session_002", "We never use plain string matching for unit testing LLMs.");

  const recallMemory = tool({
    description: "Recalls relevant long-term memories from previous sessions.",
    inputSchema: z.object({
      searchTopic: z.string().describe("The topic to search past memories for."),
    }),
    execute: async ({ searchTopic }) => store.recall(searchTopic),
  });

  console.log("\n--- Session 3: New Prompt Querying Past Facts ---");
  const newQuery = "What hosting platform and vector database does our team use?";

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an enterprise AI assistant with long-term memory. " +
      "Use the recallMemory tool to look up past preferences and context before answering.",
    prompt: newQuery,
    tools: { recallMemory },
    stopWhen: stepCountIs(3),
  });

  console.log("\n--- Agent Response ---");
  console.log(`Answer: ${text}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMemoryDemo().catch(console.error);
}
