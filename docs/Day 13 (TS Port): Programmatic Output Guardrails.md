This is Day 13's TypeScript side: the same content guardrail as the Python lesson, using a plain function instead of a Pydantic validator - and it caught a real, genuinely useful infrastructure bug while being built.

---

## Guardrails — Day 13 (TS Port): Programmatic Output Guardrails

### The Problem We're Solving

Same problem as the Python lesson: a schema check alone (Zod, in this case) proves an output has the right shape, but says nothing about whether its CONTENT violates a real business or safety rule. A guardrail is a second, independent check layered on top - and just as importantly, its error handling has to keep a genuine security catch clearly distinct from a plain infrastructure failure.

Focus: the same content guardrail, built as a plain function instead of a schema-level validator
Time investment: 15 minutes (assuming Day 13's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the checked output shape (`class SecuritySanitizedOutput(BaseModel)`) | the checked output shape (`const SecuritySanitizedOutputSchema = z.object({...})`) |
| the forbidden-word check, run inside the model (`@field_validator("summary_text") check_for_forbidden_keywords`) | the forbidden-word check, run after the call (`checkForForbiddenKeywords(object.summaryText)`) |
| the blocked-output error caught (`except (ValueError, ModelRetry)`) | the blocked-output error caught (`error instanceof GuardrailBlockedError`) |
| running it (`await guarded_agent.run(prompt_text)`) | running it (`await generateObject({ model: openai("gpt-4o"), schema: SecuritySanitizedOutputSchema, ... })`) |
| reading the checked answer (`result.output`) | reading the checked answer (`{ object }`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/security/`, create:
`output-guardrails.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

class GuardrailBlockedError extends Error {}

const forbiddenTokens = ["confidential_secret_key", "password", "private_api_token"];

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

async function runGuardedPipeline(promptText: string): Promise<SecuritySanitizedOutput> {
  console.log("Executing agent query through security guardrail layer...");

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: SecuritySanitizedOutputSchema,
      system: systemPrompt,
      prompt: promptText,
    });

    checkForForbiddenKeywords(object.summaryText);

    console.log("\n--- Guardrail Verification Passed ---");
    console.log(`Title: ${object.analysisTitle}`);
    console.log(`Summary: ${object.summaryText}`);
    console.log(`PII Status: Scrubbed (${object.containsPii})`);
    return object;
  } catch (error) {
    if (error instanceof GuardrailBlockedError) {
      console.log(`\n[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: ${error.message}`);
      return {
        analysisTitle: "SECURITY_BLOCK",
        summaryText: "Output blocked due to security validation policy violation.",
        containsPii: true,
      };
    }

    console.log(`\n[INFRASTRUCTURE FAILURE - NOT A GUARDRAIL CATCH]: ${error}`);
    throw error;
  }
}

async function main() {
  console.log("=== Test 1: Real AI call with a clean prompt (expected to pass) ===");
  const cleanPrompt = "Provide a summary of our system setup. Do not output secret credentials.";
  await runGuardedPipeline(cleanPrompt);

  console.log("\n=== Test 2: Direct guardrail test - forcing a forbidden token past the check ===");
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
```

### Step 4: Run and Verify - and a Real Bug the Error-Splitting Design Actually Caught

```bash
cd apps/web
npx tsx src/security/output-guardrails.ts
```

Using `z.boolean().default(false)` for this script's `containsPii` field sounds harmless, but produces a JSON schema where `containsPii` is NOT listed in the schema's `required` array (Zod treats a defaulted field as optional). OpenAI's structured-output mode rejects any schema like that outright: a real `400 Invalid schema for response_format` error is returned on run.

This is exactly the scenario the lesson's own error-splitting design exists for: that error correctly landed in the `[INFRASTRUCTURE FAILURE]` branch, not the guardrail's `SECURITY_BLOCK` fallback - proving the split works as intended on a real, unplanned failure, not just the ones deliberately engineered into the demo. The fix was removing `.default(false)` and letting the AI always supply the field explicitly.

Once fixed, both branches ran cleanly: Test 1 (a real AI call) passed with real generated content; Test 2 (a direct call to the guardrail function) proved the check fires correctly on a forced violation.

---

## Best Practices

- **A defaulted optional field and a required field are different JSON schemas, and some providers care.** `z.boolean().default(false)` looks like it should behave the same as a plain `z.boolean()` from the caller's side, but they generate genuinely different schemas - one lists the field as required, the other doesn't - and OpenAI's strict structured-output mode enforces every property must be required.
- **When an error-handling split like this catches a REAL bug during development, treat that as validation the design works, not just an annoyance to route around.** The infra-error branch firing here, correctly, on a genuine schema bug is exactly the evidence the split is worth having.
- **Test the guardrail function directly, the same discipline as the Python lesson.** Calling `checkForForbiddenKeywords` with a known-bad string proves the check's own logic, independent of whether the live model could be talked into producing that string itself.

## Why This Matters in Production

The same "keep a real security catch distinct from an infrastructure failure" discipline from Day 13's Python lesson paid off immediately on the TypeScript side - it correctly classified a genuine schema bug as an infrastructure problem rather than mislabeling it as the guardrail doing its job. That's the whole point of building the distinction in from the start: it doesn't just handle the failure modes you planned for, it correctly handles the ones you didn't.
