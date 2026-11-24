import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const CachedAnalysisReportSchema = z.object({
  query: z.string(),
  keyFindings: z.array(z.string()).describe("Key insights extracted from the cached corpus."),
});

// Repeated 130x (not a smaller number), the same fix the Python lesson
// needed: OpenAI's automatic prompt caching only activates above roughly
// 1024 tokens of shared prefix - a shorter corpus would never trigger a
// cache hit regardless of how many calls follow it.
const LARGE_ENTERPRISE_CORPUS = `
=== SOVEREIGN INTELLIGENCE HUB SYSTEM ARCHITECTURE SPECIFICATION ===
MODULE 1: AGENT CORE
We enforce type-safe agent execution using the Vercel AI SDK across all microservices.
Every agent response maps to an explicit Zod schema with automatic validation and retry loops.
Dynamic dependencies pass through typed context without global variable state.

MODULE 2: RETRIEVAL & VECTOR CACHE
We utilize Qdrant for dense-sparse hybrid vector retrieval with Reciprocal Rank Fusion (RRF).
A semantic vector cache intercepts redundant queries with cosine similarity >= 0.90 to return sub-10ms answers.
Knowledge Graphs extract (Subject -> Predicate -> Object) triplets for multi-hop relational reasoning.

MODULE 3: OBSERVABILITY & SECURITY
OpenTelemetry traces collect span hierarchies using Logfire and Langfuse integration.
Guardrails AI inspects output text for PII leakage, prompt injections, and security rule violations.
Adversarial red-teaming agents intercept jailbreak attempts before executing primary agent tasks.
=====================================================================
`.repeat(130);

const systemPrompt =
  "We are a principal AI cost engineer. " +
  "Analyze queries against our cached system architecture corpus cleanly and concisely.\n\n" +
  `CORPUS CONTEXT:\n${LARGE_ENTERPRISE_CORPUS}`;

async function runCachedQuery(prompt: string) {
  const start = performance.now();

  console.log(`Executing query against cached context: '${prompt}'...`);
  const { object, usage } = await generateObject({
    model: openai("gpt-4o"),
    schema: CachedAnalysisReportSchema,
    system: systemPrompt,
    prompt,
  });

  const latencyMs = performance.now() - start;

  // Same correction as the Python lesson: the model itself cannot know
  // whether its own system prompt was served from OpenAI's cache - that
  // signal lives only in the API response's usage metadata
  // (inputTokenDetails.cacheReadTokens), never in anything a model can
  // self-report.
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;

  console.log("\n--- Agent Response Received ---");
  console.log(`Latency: ${latencyMs.toFixed(2)} ms`);
  console.log(`Cache Read Tokens: ${cacheReadTokens}`);
  console.log("Findings:");
  for (const finding of object.keyFindings) {
    console.log(` - ${finding}`);
  }

  return { ...object, latencyMs, cacheReadTokens };
}

async function main() {
  console.log("--- Call 1: Initializing Cache ---");
  await runCachedQuery("What vector store and fusion algorithm do we use for RAG?");

  console.log(`\n${"=".repeat(50)}\n`);

  console.log("--- Call 2: Reusing Cached Prompt Context ---");
  await runCachedQuery("How do we handle observability and red-teaming security?");
}

main().catch(console.error);
