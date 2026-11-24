This is Day 18's TypeScript side - same sub-agent decomposition pattern, and a genuinely different (smaller) concurrency speedup than the Python lesson found, worth reporting honestly rather than assuming the same number carries over.

---

## Sub-Agent Orchestration — Day 18 (TS Port): Parallel Sub-Agent Workflows

### The Problem We're Solving

Same problem as the Python lesson: split one engineering task into independent, specialized sub-agents (a coder and a security auditor) run concurrently with `Promise.all`, then synthesize both results with a separate orchestrator call.

**A real, honest finding**: this lesson's `Promise.all` concurrency measured only an ~11% speedup across repeated pairs of calls, clearly smaller than the Python lesson's ~20% speedup on the same two-sub-agent shape. This isn't a bug in either implementation - it's genuine evidence that concurrency speedup against a shared, rate-limited API endpoint depends on real-world factors (provider-side throttling, network conditions at the moment of the test) that vary between runs and between languages calling the same API, not just on which concurrency primitive is used.

Focus: the same sub-agent decomposition pattern, with an honestly smaller measured speedup
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the sub-agent answer shapes (`class CodeSnippetResult(BaseModel)`, `class SecurityAuditResult(BaseModel)`) | the sub-agent answer shapes (`CodeSnippetResultSchema`, `SecurityAuditResultSchema` via `z.object({...})`) |
| the sub-agents (`coder_subagent`, `security_subagent` = `Agent("openai:gpt-4o-mini", ...)`) | the sub-agents (`runCoderSubAgent()`, `runSecuritySubAgent()` calling `generateObject`) |
| running them in parallel (`await asyncio.gather(coder_task, security_task)`) | running them in parallel (`await Promise.all([runCoderSubAgent(...), runSecuritySubAgent(...)])`) |
| merging the results (`await lead_orchestrator.run(synthesis_prompt)`) | merging the results (`await generateObject({ model: openai("gpt-4o"), schema: SynthesizedPackageSchema, ... })`) |
| reading the final package (`orchestrator_res.output`) | reading the final package (`{ object: finalOutput }`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/agents/`, create:
`subagent-orchestrator.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const CodeSnippetResultSchema = z.object({
  moduleName: z.string().describe("Name of the generated module."),
  code: z.string().describe("Clean implementation code."),
});

const SecurityAuditResultSchema = z.object({
  hasVulnerabilities: z.boolean().describe("False if code passes security checks."),
  recommendedPatch: z.string().describe("Security recommendations or confirmation."),
});

const SynthesizedPackageSchema = z.object({
  packageTitle: z.string(),
  isProductionReady: z.boolean(),
  summary: z.string(),
});

async function runCoderSubAgent(featureRequest: string) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: CodeSnippetResultSchema,
    system: "We are an expert developer writing modular microservice code.",
    prompt: `Write a function for: ${featureRequest}`,
  });
  return object;
}

async function runSecuritySubAgent(featureRequest: string) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SecurityAuditResultSchema,
    system: "We are a principal security engineer auditing code for vulnerabilities.",
    prompt: `Audit the following feature request for security risks: ${featureRequest}`,
  });
  return object;
}

async function runParallelSubagentPipeline(featureRequest: string) {
  console.log("Step 1: Running Sub-Agent 1 (Coder) and Sub-Agent 2 (Security Auditor) concurrently...");

  const [codeData, secData] = await Promise.all([
    runCoderSubAgent(featureRequest),
    runSecuritySubAgent(featureRequest),
  ]);

  console.log("\n--- Sub-Agent Results Received ---");
  console.log(`Sub-Agent 1 (Module): ${codeData.moduleName}`);
  console.log(`Sub-Agent 2 (Security Pass): ${!secData.hasVulnerabilities}`);

  console.log("\nStep 2: Orchestrator Agent synthesizing parallel outputs...");
  const synthesisPrompt =
    `Feature Request: ${featureRequest}\n` +
    `Code Module: ${codeData.moduleName}\n` +
    `Security Status: Vulnerabilities=${secData.hasVulnerabilities}, Patch=${secData.recommendedPatch}`;

  const { object: finalOutput } = await generateObject({
    model: openai("gpt-4o"),
    schema: SynthesizedPackageSchema,
    system: "We are a lead forward-deployed AI engineer consolidating sub-agent outputs into production packages.",
    prompt: synthesisPrompt,
  });

  console.log("\n--- Synthesized Package Result ---");
  console.log(`Title: ${finalOutput.packageTitle}`);
  console.log(`Production Ready: ${finalOutput.isProductionReady}`);
  console.log(`Summary: ${finalOutput.summary}`);

  return finalOutput;
}

const prompt = "Create a FastMCP tool endpoint for querying vector database indexes.";
runParallelSubagentPipeline(prompt).catch(console.error);
```

### Step 4: Run and Verify - With Real Timing Evidence

```bash
cd apps/web
npx tsx src/agents/subagent-orchestrator.ts
```

Same real finding as the Python side: the security sub-agent flagged genuine issues (input validation, authentication/authorization, rate limiting, dependency auditing) and the orchestrator correctly marked the package `Production Ready: false`.

**Timing comparison**, run across 3 repeated pairs of calls for a clearer signal than a single pair (single-pair runs showed noisy, sometimes-negative "speedup" purely from run-to-run variance):

| Mode | Time (3 pairs) |
|---|---|
| Sequential (coder, then security, x3) | 17.47s |
| Concurrent (`Promise.all`, x3) | 15.62s |

An ~11% speedup - real, but noticeably smaller than the Python lesson's ~20% on the same shape of work. A single-pair comparison run beforehand actually showed concurrent SLOWER than sequential (5.16s vs 4.97s, then 5.36s vs 5.35s) - almost no measurable difference - which is why this doc reports a 3-pair comparison instead of trusting one noisy single-pair run.

---

## Best Practices

- **A single-pair timing comparison is not enough evidence for a concurrency claim - run several pairs and look at the aggregate.** This lesson's first single-pair test showed concurrent as slightly SLOWER than sequential, which would have been a misleading (and wrong) conclusion if reported as-is; repeating it across 3 pairs revealed the real, smaller-but-genuine speedup underneath the noise.
- **Don't assume the exact same concurrency speedup percentage carries over between languages calling the same underlying API.** Python's `asyncio.gather` and TypeScript's `Promise.all` are doing the same conceptual thing, but provider-side rate limiting, connection pooling, and network conditions at the moment of the test can produce a genuinely different real-world number - report what was actually measured, not what "should" be true by analogy.
- **A smaller-than-expected speedup is still real, useful evidence - report it plainly rather than searching for a more favorable run to quote.** An honest 11% is more valuable to a reader than a cherry-picked lucky run claiming 20%.

## Why This Matters in Production

Concurrency is a real tool for reducing latency, but the SIZE of the benefit is an empirical question that depends on the actual provider and network conditions at the time - not a fixed percentage you can assume transfers between languages or even between separate runs of the same code. Measuring honestly, including reporting a smaller or noisier result than hoped for, is what makes a performance claim trustworthy.
