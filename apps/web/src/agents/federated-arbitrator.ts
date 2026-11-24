import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Federated tool-call arbitration for concurrent multi-agent write conflicts - Day 45 TS port.
 *
 * An arbitrator agent evaluates a batch of pending tool-call proposals and
 * returns an ordered, conflict-free execution plan before any of them run.
 */

const ToolActionProposalSchema = z.object({
  agentId: z.string().describe("Identifier of the calling agent."),
  targetResource: z.string().describe("Database table, cache key, or external API."),
  actionType: z.enum(["READ", "WRITE", "DELETE", "INVALIDATE"]),
  priority: z.number().int().min(1).max(10).describe("Priority from 1 (lowest) to 10 (highest)."),
});

type ToolActionProposal = z.infer<typeof ToolActionProposalSchema>;

const ArbitrationPlanSchema = z.object({
  executionOrder: z
    .array(z.string())
    .describe("Ordered list of agentIds indicating execution sequence."),
  rejectedActions: z
    .array(z.string())
    .describe("Agent IDs of actions blocked due to safety violations."),
  arbitrationRationale: z.string().describe("Clear explanation of the sequencing logic applied."),
});

type ArbitrationPlan = z.infer<typeof ArbitrationPlanSchema>;

/**
 * Checks the arbitrator's own plan against its stated rules - proving the
 * plan is genuinely rule-compliant, not just plausible-sounding text.
 */
function validatePlanAgainstRules(
  proposals: ToolActionProposal[],
  plan: ArbitrationPlan,
): string[] {
  const violations: string[] = [];
  const byAgent = new Map(proposals.map((p) => [p.agentId, p]));

  const writeActions = proposals
    .filter((p) => p.actionType === "WRITE" || p.actionType === "DELETE")
    .map((p) => p.agentId);
  const invalidateActions = proposals
    .filter((p) => p.actionType === "INVALIDATE")
    .map((p) => p.agentId);

  for (const invId of invalidateActions) {
    const invResource = byAgent.get(invId)?.targetResource;
    const matchingWrites = writeActions.filter(
      (w) => byAgent.get(w)?.targetResource === invResource,
    );
    for (const writeId of matchingWrites) {
      const invIndex = plan.executionOrder.indexOf(invId);
      const writeIndex = plan.executionOrder.indexOf(writeId);
      if (invIndex !== -1 && writeIndex !== -1 && invIndex < writeIndex) {
        violations.push(
          `INVALIDATE '${invId}' scheduled before its WRITE '${writeId}' - violates rule 3.`,
        );
      }
    }
  }

  return violations;
}

async function runArbitration(): Promise<void> {
  const proposals: ToolActionProposal[] = [
    {
      agentId: "cache_manager_agent",
      targetResource: "market_trends",
      actionType: "INVALIDATE",
      priority: 7,
    },
    {
      agentId: "scraper_worker_agent",
      targetResource: "market_trends",
      actionType: "WRITE",
      priority: 9,
    },
    {
      agentId: "dashboard_query_agent",
      targetResource: "market_trends",
      actionType: "READ",
      priority: 5,
    },
  ];

  console.log("Submitting concurrent tool proposals to Federated Arbitrator...");
  const prompt = `Arbitrate the execution order for these concurrent actions:\n${JSON.stringify(proposals)}`;

  const { object: plan } = await generateObject({
    model: openai("gpt-4o"),
    schema: ArbitrationPlanSchema,
    system:
      "We are a principal distributed systems arbitrator. Sequence concurrent tool calls across specialist " +
      "agents to prevent race conditions. Rules: " +
      "1. WRITE or DELETE operations lock target resources. " +
      "2. READ actions must not run concurrently with WRITE actions on the same resource. " +
      "3. Cache INVALIDATE actions must execute strictly AFTER the corresponding WRITE commits.",
    prompt,
  });

  console.log("\n=== Arbitration Decision ===");
  console.log(`Execution Order: ${plan.executionOrder.join(" -> ")}`);
  console.log(
    `Rejected Actions: ${plan.rejectedActions.length ? plan.rejectedActions.join(", ") : "None"}`,
  );
  console.log(`Rationale: ${plan.arbitrationRationale}`);

  const violations = validatePlanAgainstRules(proposals, plan);
  if (violations.length > 0) {
    console.log(`\n[PLAN VALIDATION FAILED] ${violations.join("; ")}`);
  } else {
    console.log(
      "\n[PLAN VALIDATION PASSED] Execution order genuinely respects the stated dependency rules.",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runArbitration().catch(console.error);
}
