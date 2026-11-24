import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Dynamic tool schema introspection & MCP tool synthesis - Day 48 TS port.
 *
 * Zod has no direct equivalent of pydantic's create_model(**fields), but
 * the same idea - build a validated schema at runtime from a discovered
 * manifest, not a hand-written static type - works by building a
 * Record<string, ZodType> from the manifest and passing it to z.object().
 */

/** Simulates an MCP tool manifest discovered from an external server at runtime. */
interface McpToolManifest {
  toolName: string;
  description: string;
  parameters: Record<string, z.ZodType>;
}

const mcpToolManifest: McpToolManifest = {
  toolName: "fetch_bond_yield_curve",
  description: "Calculates sovereign bond yield curves for portfolio cash placement.",
  parameters: {
    benchmarkIsin: z.string().describe("ISIN code for benchmark bond."),
    targetTenorMonths: z.number().int().min(1).max(360).describe("Tenor duration in months."),
    includeSpread: z.boolean().describe("Whether to include basis point credit spread."),
  },
};

/** Dynamically compiles a validated Zod schema from an MCP parameter manifest. */
function buildDynamicSchema(manifest: McpToolManifest): z.ZodObject<Record<string, z.ZodType>> {
  return z.object(manifest.parameters);
}

const DynamicBondInputSchema = buildDynamicSchema(mcpToolManifest);

const executeDynamicMcpTool = tool({
  description: "Executes the dynamically synthesized tool.",
  inputSchema: DynamicBondInputSchema,
  execute: async (toolArgs) => {
    console.log(`\n[TOOL EXECUTED] Validated payload: ${JSON.stringify(toolArgs)}`);
    return `Synthesized yield calculation complete for ${toolArgs.benchmarkIsin}: Yield 4.12% across ${toolArgs.targetTenorMonths} months.`;
  },
});

async function main(): Promise<void> {
  console.log("--- Test 1: Dynamic Schema Synthesis from a Valid MCP Manifest ---");
  const userQuery =
    "Calculate the bond yield for benchmark ISIN GB00BM8Z2S21 for a 24 month duration.";
  console.log(`User Request: ${userQuery}`);

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an autonomous financial integration architect. Use the dynamically discovered tool to " +
      "analyze target sovereign debt allocations.",
    tools: { executeDynamicMcpTool },
    stopWhen: stepCountIs(3),
    prompt: userQuery,
  });

  console.log("\n=== Agent Result ===");
  console.log(text);

  console.log("\n--- Test 2: Directly Verifying the Synthesized Schema Rejects Invalid Input ---");
  const outOfRange = DynamicBondInputSchema.safeParse({
    benchmarkIsin: "GB00BM8Z2S21",
    targetTenorMonths: 999,
    includeSpread: true,
  });
  console.log(
    outOfRange.success
      ? "BUG: expected a validation error for targetTenorMonths=999 (max is 360), but it passed."
      : "[VERIFIED] Dynamically synthesized schema correctly rejected out-of-range input: ZodError",
  );

  console.log("\n--- Test 3: Directly Verifying a Manifest-less Field Requires Explicit Value ---");
  const missingField = DynamicBondInputSchema.safeParse({
    benchmarkIsin: "GB00BM8Z2S21",
    targetTenorMonths: 24,
  });
  console.log(
    missingField.success
      ? "BUG: expected includeSpread to be required since no default was set in the manifest."
      : "[VERIFIED] includeSpread correctly required (no default in manifest): ZodError",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
