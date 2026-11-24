import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { embed, generateText } from "ai";

// What a routed query returns: which model actually handled it, whether it
// came from the cache, how long it took, and the real answer.
interface RoutedResponse {
  query: string;
  modelUsed: string;
  isCached: boolean;
  latencyMs: number;
  content: string;
}

// A tiny vector store held entirely in memory: no external database, just
// an array of {text, embedding, cached answer} entries. This is enough to
// prove the caching IDEA works; a real deployment would swap this for a
// real vector database without changing how the router calls it.
class SemanticCache {
  private readonly threshold: number;
  private readonly records: Array<{ query: string; vector: number[]; output: string }> = [];

  constructor(similarityThreshold = 0.92) {
    this.threshold = similarityThreshold;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.textEmbeddingModel("text-embedding-3-small"),
      value: text,
    });
    return embedding;
  }

  // Cosine similarity measures how close two embeddings point in the same
  // direction, from -1 (opposite) to 1 (identical meaning) - the actual
  // math behind "these two questions mean roughly the same thing," even
  // when they share no words in common.
  private static cosineSimilarity(v1: number[], v2: number[]): number {
    const dotProduct = v1.reduce((sum, a, i) => sum + a * v2[i], 0);
    const normV1 = Math.sqrt(v1.reduce((sum, a) => sum + a * a, 0));
    const normV2 = Math.sqrt(v2.reduce((sum, b) => sum + b * b, 0));
    return normV1 && normV2 ? dotProduct / (normV1 * normV2) : 0;
  }

  async lookup(query: string): Promise<string | null> {
    if (this.records.length === 0) return null;

    const queryVector = await this.getEmbedding(query);
    let bestMatch: string | null = null;
    let highestScore = 0;

    for (const record of this.records) {
      const score = SemanticCache.cosineSimilarity(queryVector, record.vector);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = record.output;
      }
    }

    if (highestScore >= this.threshold) {
      console.log(`  [CACHE HIT] Semantic match found (Similarity: ${highestScore.toFixed(4)})`);
      return bestMatch;
    }

    console.log(
      `  [CACHE MISS] Highest similarity was ${highestScore.toFixed(4)} < ${this.threshold}`,
    );
    return null;
  }

  async store(query: string, output: string): Promise<void> {
    const vector = await this.getEmbedding(query);
    this.records.push({ query, vector, output });
  }
}

// Two models at two different cost/quality points, plus a cache in front
// of both. A "router" here just means: decide which of several options
// should actually handle this specific request, instead of always using
// the same one regardless of how simple or complex it is.
class MultiModelRouter {
  constructor(private readonly cache: SemanticCache) {}

  async query(prompt: string): Promise<RoutedResponse> {
    const startTime = performance.now();

    // A cache hit skips the AI call ENTIRELY - no model, no cost, no
    // meaningful latency. Only possible because the lookup is by MEANING
    // (cosine similarity), not an exact string match.
    const cachedContent = await this.cache.lookup(prompt);
    if (cachedContent) {
      const latency = performance.now() - startTime;
      return {
        query: prompt,
        modelUsed: "semantic-cache-v1",
        isCached: true,
        latencyMs: Math.round(latency * 100) / 100,
        content: cachedContent,
      };
    }

    // Route by complexity. A cheap keyword check is enough here - reaching
    // for another AI call just to decide which AI call to make would
    // defeat the purpose of routing to save cost.
    const isComplex = ["architecture", "pydantic", "monorepo", "fastmcp"].some((keyword) =>
      prompt.toLowerCase().includes(keyword),
    );
    const selectedModel = isComplex ? "gpt-4o" : "gpt-4o-mini";
    const systemPrompt = isComplex
      ? "Provide deep, type-safe architecture advice."
      : "Answer concisely.";

    console.log(`  [ROUTER DISPATCH] Routing query to: ${selectedModel}`);
    const { text } = await generateText({
      model: openai(selectedModel),
      system: systemPrompt,
      prompt,
    });

    // Store this exchange so a FUTURE, differently-worded version of the
    // same question can hit the cache next time.
    await this.cache.store(prompt, text);

    const latency = performance.now() - startTime;
    return {
      query: prompt,
      modelUsed: selectedModel,
      isCached: false,
      latencyMs: Math.round(latency * 100) / 100,
      content: text,
    };
  }
}

async function main() {
  const cache = new SemanticCache(0.9);
  const router = new MultiModelRouter(cache);

  console.log("--- Query 1: Initial Complex Architecture Request ---");
  const res1 = await router.query("How do we structure a Pydantic AI monorepo with FastMCP?");
  console.log(
    `Model: ${res1.modelUsed} | Latency: ${res1.latencyMs}ms | Cached: ${res1.isCached}\n`,
  );

  console.log("--- Query 2: Semantically Equivalent Request (Should HIT Cache) ---");
  const res2 = await router.query(
    "What is the best way to structure a monorepo for Pydantic AI and FastMCP?",
  );
  console.log(
    `Model: ${res2.modelUsed} | Latency: ${res2.latencyMs}ms | Cached: ${res2.isCached}\n`,
  );

  console.log("--- Query 3: Simple Request (Should Route to Light Model) ---");
  const res3 = await router.query("What does API stand for?");
  console.log(
    `Model: ${res3.modelUsed} | Latency: ${res3.latencyMs}ms | Cached: ${res3.isCached}\n`,
  );
}

main().catch(console.error);
