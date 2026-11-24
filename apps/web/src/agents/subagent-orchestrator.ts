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

// Two independent, cheaper sub-agents run CONCURRENTLY on the SAME feature
// request but from different angles - one writes code, one audits security
// risk - the same Promise.all concurrency tool as Day 8's batching and
// Day 15's swarm voting, applied here to task DECOMPOSITION rather than
// running identical copies of one task.
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
  console.log(
    "Step 1: Running Sub-Agent 1 (Coder) and Sub-Agent 2 (Security Auditor) concurrently...",
  );

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
    system:
      "We are a lead forward-deployed AI engineer consolidating sub-agent outputs into production packages.",
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
