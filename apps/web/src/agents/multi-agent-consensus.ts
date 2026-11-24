import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// What the Worker Agent produces: a proposed subsystem design.
const ArchitectureDraftSchema = z.object({
  title: z.string().describe("Name of the proposed system subsystem."),
  techStack: z.array(z.string()).describe("Primary tools used in the build."),
  implementationCode: z.string().describe("Sample implementation snippet."),
});

// What the Auditor Agent produces: a pass/fail judgement on the Worker's
// draft, plus feedback if it's rejected. A genuinely different shape from
// ArchitectureDraft - the auditor isn't writing more code, it's grading
// the code that already exists.
const AuditReportSchema = z.object({
  isApproved: z.boolean().describe("True if the code meets enterprise standards."),
  securityScore: z.number().describe("Score from 1 to 10 evaluating safety."),
  requiredEdits: z.string().nullable().describe("Feedback if approval is denied."),
});

// Runs the two-step hand-off: the Worker drafts a solution, then the
// Auditor reviews that SAME draft as a completely separate AI call, with
// no visibility into how confident the Worker felt about its own answer -
// only the actual output, exactly as a real second reviewer would see it.
async function generateAndVerify(userRequirement: string) {
  console.log("Step 1: Worker Agent generating architectural draft...");
  const { object: draft } = await generateObject({
    model: openai("gpt-4o"),
    schema: ArchitectureDraftSchema,
    system: "We are a senior AI software engineer drafting system architectures.",
    prompt: userRequirement,
  });

  console.log("Step 2: Passing draft to Auditor Agent for verification...");
  const auditInput =
    `Subsystem Title: ${draft.title}\n` +
    `Stack: ${draft.techStack.join(", ")}\n` +
    `Code:\n${draft.implementationCode}`;

  const { object: audit } = await generateObject({
    model: openai("gpt-4o"),
    schema: AuditReportSchema,
    system: "We are a principal security architect reviewing agent code outputs for safety.",
    prompt: auditInput,
  });

  console.log("\n--- Consensus Pipeline Results ---");
  console.log(`System: ${draft.title}`);
  console.log(`Audit Approval Status: ${audit.isApproved ? "APPROVED" : "REJECTED"}`);
  console.log(`Security Rating: ${audit.securityScore}/10`);

  if (!audit.isApproved) {
    console.log(`Feedback Required: ${audit.requiredEdits}`);
  }

  return { draft, audit };
}

async function main() {
  const prompt = "Create a type-safe streaming route using the Vercel AI SDK and TypeScript.";
  await generateAndVerify(prompt);
}

main().catch(console.error);
