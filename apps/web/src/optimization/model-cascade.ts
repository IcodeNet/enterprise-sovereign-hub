import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

/**
 * Dynamic model cascade with cost-aware routing and escalation - Day 37 TS port.
 *
 * A lightweight classifier inspects task complexity first: simple tasks
 * route to a fast, cheap model, complex tasks (or a cheap-model failure)
 * escalate to the frontier model.
 */

const RoutingDecisionSchema = z.object({
  complexity: z
    .enum(["LOW", "HIGH"])
    .describe("LOW for simple lookup/formatting; HIGH for deep logic."),
  justification: z.string(),
});

interface CascadeExecutionResult {
  query: string;
  tierUsed: string;
  latencyMs: number;
  output: string;
}

async function classifyComplexity(userQuery: string) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: RoutingDecisionSchema,
    system:
      "We are a precision query routing classifier. Classify tasks as LOW complexity (summaries, simple " +
      "extracts, basic formatting) or HIGH complexity (distributed architecture, multi-hop reasoning, formal verification).",
    prompt: `Evaluate complexity for: ${userQuery}`,
  });
  return object;
}

async function runTier1(userQuery: string): Promise<string> {
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: "We are Tier 1: fast, efficient, low-latency microservice assistant.",
    prompt: userQuery,
  });
  return text;
}

async function runTier2(userQuery: string): Promise<string> {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: "We are Tier 2: principal systems architect for complex reasoning.",
    prompt: userQuery,
  });
  return text;
}

async function executeCascadeQuery(userQuery: string): Promise<CascadeExecutionResult> {
  const startTime = Date.now();
  console.log(`\nAnalyzing Query: '${userQuery}'`);

  const decision = await classifyComplexity(userQuery);
  console.log(` [ROUTER] Complexity: ${decision.complexity} | Reason: ${decision.justification}`);

  let tierUsed = "Tier 1 (gpt-4o-mini)";
  let finalText: string;

  if (decision.complexity === "LOW") {
    try {
      console.log(" [DISPATCH] Executing on low-cost Tier 1 model...");
      finalText = await runTier1(userQuery);
    } catch (error) {
      console.log(
        ` [TIER 1 FAILURE] ${(error as Error).message}. Escalating to Tier 2 frontier...`,
      );
      finalText = await runTier2(userQuery);
      tierUsed = "Tier 2 (gpt-4o - Escalated)";
    }
  } else {
    console.log(" [DISPATCH] High complexity detected. Routing directly to Tier 2 frontier...");
    finalText = await runTier2(userQuery);
    tierUsed = "Tier 2 (gpt-4o - Direct)";
  }

  const latencyMs = Math.round((Date.now() - startTime) * 100) / 100;
  return { query: userQuery, tierUsed, latencyMs, output: finalText };
}

async function main(): Promise<void> {
  const q1 =
    "Extract the email from: 'Contact our support team at support@example.com for details.'";
  const r1 = await executeCascadeQuery(q1);
  console.log(`Result 1 (${r1.tierUsed}, ${r1.latencyMs}ms):\n${r1.output}\n`);

  const q2 = "Architect a Byzantine fault-tolerant consensus protocol for multi-region Redis sync.";
  const r2 = await executeCascadeQuery(q2);
  console.log(`Result 2 (${r2.tierUsed}, ${r2.latencyMs}ms):\n${r2.output.slice(0, 120)}...\n`);

  console.log(`Latency comparison: LOW=${r1.latencyMs}ms vs HIGH=${r2.latencyMs}ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
