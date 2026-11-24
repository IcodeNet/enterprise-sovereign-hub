This is Day 9's TypeScript side: the same Worker/Auditor hand-off as the Python lesson, using the Vercel AI SDK's `generateObject` for both agents.

---

## Multi-Agent Systems — Day 9 (TS Port): Multi-Agent Hand-Off & Verification

### The Problem We're Solving

Same problem as the Python lesson: one AI call can't reliably grade its own work, because whatever mistake it made while generating is invisible to it while reviewing. The fix is the same genuine hand-off - a Worker agent that drafts a solution, and a completely separate Auditor agent call that reviews only the Worker's actual output.

This lesson doesn't need Pydantic AI's `Agent` class or LangGraph's graph structure - two independent `generateObject` calls, each with their own schema and system prompt, are enough to build a real Worker/Auditor pipeline.

Focus: the same two-agent hand-off, built with two independent `generateObject` calls
Time investment: 15 minutes (assuming Day 9's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the worker's answer shape (`class ArchitectureDraft(BaseModel)`) | the worker's answer shape (`const ArchitectureDraftSchema = z.object({...})`) |
| the auditor's verdict shape (`class AuditReport(BaseModel)`) | the auditor's verdict shape (`const AuditReportSchema = z.object({...})`) |
| the two agents (`worker_agent = Agent(..., output_type=ArchitectureDraft)`, `auditor_agent = Agent(..., output_type=AuditReport)`) | the two agents (two separate `generateObject({ schema: ArchitectureDraftSchema })` / `generateObject({ schema: AuditReportSchema })` calls) |
| running the hand-off (`await generate_and_verify(prompt)`) | running the hand-off (`await generateAndVerify(prompt)`) |
| reading the verdict (`audit_data.is_approved`, `audit_data.required_edits`) | reading the verdict (`audit.isApproved`, `audit.requiredEdits`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/agents/`, create:
`multi-agent-consensus.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const ArchitectureDraftSchema = z.object({
  title: z.string().describe("Name of the proposed system subsystem."),
  techStack: z.array(z.string()).describe("Primary tools used in the build."),
  implementationCode: z.string().describe("Sample implementation snippet."),
});

const AuditReportSchema = z.object({
  isApproved: z.boolean().describe("True if the code meets enterprise standards."),
  securityScore: z.number().describe("Score from 1 to 10 evaluating safety."),
  requiredEdits: z.string().nullable().describe("Feedback if approval is denied."),
});

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
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/agents/multi-agent-consensus.ts
```

Same evidence standard as Python: this run produced a genuine **REJECTED** verdict, security score 6/10, with concrete feedback - generic error handling with no logging before a 500 response, missing input validation, no CORS policy, no rate limiting, missing security headers, and a call-out to add the `helmet` middleware. That's a real second opinion catching real issues, not an agent that rubber-stamps whatever it's shown.

---

## Best Practices

- **Two independent `generateObject` calls are enough for a genuine hand-off - no special "multi-agent" library required.** The pattern is about the SEPARATION of roles and schemas, not about which SDK feature is used to make each individual call.
- **Different schemas for different jobs, same as the Python lesson.** `AuditReportSchema` has no field in common with `ArchitectureDraftSchema` on purpose - one describes a solution, the other describes a judgement about a solution, and conflating them would blur what each call is actually for.
- **Watch for a rubber-stamp auditor, in either language.** If porting this pattern to a new use case and the second agent always approves, that's worth investigating as a prompt or schema problem before trusting the "verification" step at all.

## Why This Matters in Production

The same Worker/Auditor consensus pattern from Day 9's Python lesson works identically in TypeScript, using nothing more exotic than two separate typed AI calls. Whichever side of our stack generates something worth a second opinion - code, an analysis, a recommendation - this pattern gives us a real, demonstrated-to-actually-disagree check before anything downstream acts on it.
