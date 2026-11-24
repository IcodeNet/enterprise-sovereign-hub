import "dotenv/config";
import crypto from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Cryptographic tool permission scoping & agent identity verification - Day 52 TS port.
 *
 * Intercepts every sensitive tool call with an HMAC-signed permission
 * token, verifying both the token's signature (not forged/tampered) and
 * its scope (the caller was actually granted this action) before the
 * tool's real logic runs.
 */

class AgentSecurityContext {
  private readonly secret: string;

  constructor(signingSecret: string) {
    this.secret = signingSecret;
  }

  generateSignature(userId: string, scopes: Set<string>): string {
    const payload = `${userId}:${[...scopes].toSorted().join(",")}`;
    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  verifyPermission(
    token: { userId: string; scopes: Set<string>; signature: string },
    requiredScope: string,
  ): boolean {
    const expected = this.generateSignature(token.userId, token.scopes);
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(token.signature);
    if (
      expectedBuf.length !== signatureBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return false;
    }
    return token.scopes.has(requiredScope);
  }
}

const secManager = new AgentSecurityContext("super-secure-enterprise-key");
let activeToken: { userId: string; scopes: Set<string>; signature: string };

const executeTreasuryRebalance = tool({
  description: "Executes capital movements between institutional accounts.",
  inputSchema: z.object({ accountId: z.string(), rebalanceAmountGbp: z.number() }),
  execute: async ({ accountId, rebalanceAmountGbp }) => {
    const requiredScope = "TREASURY_WRITE";
    const isValid = secManager.verifyPermission(activeToken, requiredScope);

    if (!isValid) {
      throw new Error(
        `SECURITY VIOLATION: Caller '${activeToken.userId}' lacks verified scope '${requiredScope}'. Action has been aborted and logged.`,
      );
    }

    return `Successfully rebalanced £${rebalanceAmountGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })} on account ${accountId}.`;
  },
});

const OperationAuditResultSchema = z.object({
  accountId: z.string(),
  actionExecuted: z.string(),
  status: z.string(),
  securityVerdict: z.string(),
});

async function runSecureAgent(query: string): Promise<z.infer<typeof OperationAuditResultSchema>> {
  const { toolResults, steps } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an autonomous security and operations agent. Execute treasury operations only when the " +
      "caller's cryptographic context permits it. If the tool reports a security violation, report the " +
      "action as failed rather than retrying with different arguments.",
    tools: { executeTreasuryRebalance },
    stopWhen: stepCountIs(3),
    prompt: query,
  });

  const toolErrors = steps.flatMap((s) => s.content).filter((c) => c.type === "tool-error");
  const rawOutcome =
    toolErrors.length > 0
      ? toolErrors.map((e) => String(e.error)).join("\n")
      : toolResults.map((r) => r.output).join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: OperationAuditResultSchema,
    prompt: `Extract the structured operation audit result from this raw tool outcome:\n${rawOutcome}`,
  });
  return object;
}

async function main(): Promise<void> {
  console.log("--- Test 1: Cryptographic Tool Scope Enforcement (Unauthorized Caller) ---");
  const readOnlyScopes = new Set(["TREASURY_READ"]);
  const unauthorizedToken = {
    userId: "contractor_dev_01",
    scopes: readOnlyScopes,
    signature: secManager.generateSignature("contractor_dev_01", readOnlyScopes),
  };

  const userQuery = "Rebalance £50,000 from account ACC-4081 to liquidity reserves.";
  console.log(`Submitting query with unauthorized token: ${userQuery}`);

  activeToken = unauthorizedToken;
  const blockedResult = await runSecureAgent(userQuery);
  console.log(`[NO EXCEPTION PROPAGATED] Structured result: ${JSON.stringify(blockedResult)}`);
  if (blockedResult.status.toLowerCase() === "success") {
    throw new Error(
      "BUG: the agent's structured output claims the unauthorized rebalance SUCCEEDED - a real security failure.",
    );
  }
  console.log(
    `[VERIFIED] The agent's own structured output correctly reports the action did NOT succeed (status='${blockedResult.status}'). ` +
      "Note: a caller checking only for a thrown error, not this status field, would incorrectly believe the request was simply " +
      "'handled' rather than actively blocked.",
  );

  console.log("\n--- Test 2: Cryptographic Tool Scope Enforcement (Authorized Caller) ---");
  const authorizedScopes = new Set(["TREASURY_READ", "TREASURY_WRITE"]);
  const authorizedToken = {
    userId: "byron_lead_architect",
    scopes: authorizedScopes,
    signature: secManager.generateSignature("byron_lead_architect", authorizedScopes),
  };

  activeToken = authorizedToken;
  console.log("Submitting query with authorized token...");
  const result = await runSecureAgent(userQuery);
  console.log("=== Execution Verified & Authenticated ===");
  console.log(`Target Account: ${result.accountId}`);
  console.log(`Action: ${result.actionExecuted}`);
  console.log(`Status: ${result.status}`);

  console.log("\n--- Test 3: Directly Verifying Signature Tampering Is Caught ---");
  const forgedToken = {
    userId: "attacker_01",
    scopes: new Set(["TREASURY_READ", "TREASURY_WRITE"]),
    signature: "0".repeat(64), // a syntactically valid but forged hex signature
  };
  const isForgedValid = secManager.verifyPermission(forgedToken, "TREASURY_WRITE");
  if (isForgedValid) {
    throw new Error("BUG: a forged signature was accepted despite having the right scope claimed.");
  }
  console.log(
    "[VERIFIED] A forged signature claiming the right scope is correctly rejected - the HMAC check is genuinely cryptographic, not just a scope-membership lookup.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
