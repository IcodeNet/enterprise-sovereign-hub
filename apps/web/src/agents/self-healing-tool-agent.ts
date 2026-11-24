import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Self-healing tool correction via a thrown tool error - Day 47 TS port.
 *
 * The Vercel AI SDK's equivalent of pydantic_ai's ModelRetry: a tool's
 * execute() throwing an error becomes a tool-error result fed back into
 * the model's own context, letting it notice the mistake and retry with
 * corrected arguments on the next step (stopWhen: stepCountIs(N) is what
 * allows that next step to happen at all).
 */

function validateAccountId(rawAccountId: string): void {
  const cleanId = rawAccountId.trim();
  if (!cleanId.startsWith("ACC-") || cleanId.length !== 8 || !/^\d{4}$/.test(cleanId.slice(4))) {
    throw new Error(
      `Invalid account ID format: '${rawAccountId}'. The ID must strictly match 'ACC-XXXX' with exactly 4 ` +
        "digits (e.g. 'ACC-4081'). Please normalize the ID and try again.",
    );
  }
}

const fetchAccountLedger = tool({
  description: "Fetches the verified balance of a business savings account.",
  inputSchema: z.object({ rawAccountId: z.string() }),
  execute: async ({ rawAccountId }) => {
    // Throwing here becomes a tool-error result fed back to the model -
    // no separate retry-exception class needed, unlike pydantic_ai's
    // ModelRetry.
    validateAccountId(rawAccountId);
    return 124500.5;
  },
});

const QueryExecutionResultSchema = z.object({
  accountId: z.string().describe("Normalized customer account ID."),
  allocatedBalance: z.number().describe("Account balance retrieved safely."),
  auditNotes: z.string().describe("Notes regarding self-healing interventions."),
});

async function main(): Promise<void> {
  console.log("--- Test: Agent Self-Healing Across Faulty Tool Arguments ---");

  const imperfectInput = "Please pull the balance for customer ledger account ' acc-4081 '.";
  console.log(`Submitting query: ${imperfectInput}\n`);

  // Step 1: let the tool-calling agent run to completion (with retries on
  // a tool error), producing free text once it succeeds.
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an autonomous financial data engineer. Retrieve account balances using the fetchAccountLedger " +
      "tool. Account IDs MUST follow the strict uppercase format: 'ACC-XXXX' (where X are 4 digits). " +
      "Report the EXACT numeric balance the tool returned in your final answer.",
    tools: { fetchAccountLedger },
    stopWhen: stepCountIs(4),
    prompt: imperfectInput,
  });

  // Step 2: shape the free text into the same structured result Python
  // produces directly from the agent's own structured output_type.
  const { object: result } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: QueryExecutionResultSchema,
    prompt:
      "Extract the structured result from this agent transcript. auditNotes must summarize whether a " +
      `self-healing correction happened and what was corrected:\n${text}`,
  });

  console.log("=== Execution Verified & Self-Healed ===");
  console.log(`Target Account: ${result.accountId}`);
  console.log(
    `Retrieved Balance: £${result.allocatedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
  );
  console.log(`Audit Log: ${result.auditNotes}`);

  console.log("\n--- Direct Verification: the Validation Actually Fires on Bad Input ---");
  try {
    validateAccountId("not-a-valid-id");
    console.log("BUG: expected an error to be thrown, but the call succeeded silently.");
  } catch (error) {
    console.log(`[VERIFIED] Validation error raised as expected: ${(error as Error).message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
