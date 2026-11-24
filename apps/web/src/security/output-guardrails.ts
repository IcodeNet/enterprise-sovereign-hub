import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// A distinguishable failure type for a genuine guardrail catch, kept
// separate from a plain infrastructure error (network, auth). Collapsing
// both into one generic catch-and-fallback would make a broken deployment
// and a real security catch indistinguishable in logs and dashboards -
// exactly the harness-failure trap an eval harness can fall into.
class GuardrailBlockedError extends Error {}

const forbiddenTokens = ["confidential_secret_key", "password", "private_api_token"];

// A plain function acting as a LOCAL guardrail, the TypeScript equivalent
// of Python's Pydantic field_validator: it runs the instant the AI's
// output is available, before any downstream code ever sees the value.
function checkForForbiddenKeywords(summaryText: string): void {
  const lowered = summaryText.toLowerCase();
  for (const word of forbiddenTokens) {
    if (lowered.includes(word)) {
      throw new GuardrailBlockedError(
        `SECURITY GUARDRAIL TRIGGERED: Forbidden token '${word}' detected in agent output!`,
      );
    }
  }
}

const SecuritySanitizedOutputSchema = z.object({
  analysisTitle: z.string().describe("Name of the analysis report."),
  summaryText: z.string().describe("Executive technical summary."),
  containsPii: z.boolean().describe("Flag indicating if sensitive data was scrubbed."),
});

type SecuritySanitizedOutput = z.infer<typeof SecuritySanitizedOutputSchema>;

const systemPrompt =
  "We are an enterprise AI security agent. " +
  "Summarize technical findings cleanly. Never include raw API keys, passwords, or personal credentials.";

// Distinguishing a genuine guardrail catch from a plain infrastructure
// failure is the entire point of this lesson: one is a security policy
// working exactly as intended, the other is our own deployment being broken.
async function runGuardedPipeline(promptText: string): Promise<SecuritySanitizedOutput> {
  console.log("Executing agent query through security guardrail layer...");

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: SecuritySanitizedOutputSchema,
      system: systemPrompt,
      prompt: promptText,
    });

    // Zod's schema validation alone can't check cross-cutting business
    // rules like "does this contain a forbidden keyword" - that's exactly
    // what this extra guardrail check adds on top of the type-safety Zod
    // already gives us.
    checkForForbiddenKeywords(object.summaryText);

    console.log("\n--- Guardrail Verification Passed ---");
    console.log(`Title: ${object.analysisTitle}`);
    console.log(`Summary: ${object.summaryText}`);
    console.log(`PII Status: Scrubbed (${object.containsPii})`);
    return object;
  } catch (error) {
    if (error instanceof GuardrailBlockedError) {
      // A genuine guardrail catch: the AI actually produced forbidden
      // content, and our check correctly blocked it. This IS the
      // guardrail doing its job.
      console.log(`\n[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: ${error.message}`);
      return {
        analysisTitle: "SECURITY_BLOCK",
        summaryText: "Output blocked due to security validation policy violation.",
        containsPii: true,
      };
    }

    // A DIFFERENT kind of failure: something broke in our own plumbing.
    // Re-throwing here - rather than returning the SAME SECURITY_BLOCK
    // fallback - keeps a genuine outage from silently looking identical
    // to a working security control.
    console.log(`\n[INFRASTRUCTURE FAILURE - NOT A GUARDRAIL CATCH]: ${error}`);
    throw error;
  }
}

async function main() {
  console.log("=== Test 1: Real AI call with a clean prompt (expected to pass) ===");
  const cleanPrompt = "Provide a summary of our system setup. Do not output secret credentials.";
  await runGuardedPipeline(cleanPrompt);

  console.log("\n=== Test 2: Direct guardrail test - forcing a forbidden token past the check ===");
  // Rather than trying to social-engineer the live model into leaking a
  // forbidden token (which a well-behaved model may simply refuse to do,
  // proving nothing about whether OUR check actually works), this test
  // calls the guardrail function directly with a known-bad value.
  try {
    checkForForbiddenKeywords("Configuration note: the private_api_token is abc123.");
    console.log("[NO GUARDRAIL TRIGGERED - this would be a bug]");
  } catch (error) {
    if (error instanceof GuardrailBlockedError) {
      console.log(`[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: ${error.message}`);
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
