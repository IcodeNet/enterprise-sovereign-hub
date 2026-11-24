import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Distributed vector sharding & tenant isolation - Day 54 TS port.
 *
 * A multi-tenant vector retriever enforces tenant identifiers at the
 * index PARTITION level - not just as a filter applied after the fact -
 * so an unauthenticated cross-tenant lookup is structurally impossible,
 * not merely unlikely.
 */

interface TenantVectorPayload {
  tenantId: string;
  chunkId: string;
  textContent: string;
}

class ShardedVectorStore {
  private readonly shards = new Map<string, TenantVectorPayload[]>();

  insert(chunk: TenantVectorPayload): void {
    if (!this.shards.has(chunk.tenantId)) {
      this.shards.set(chunk.tenantId, []);
    }
    this.shards.get(chunk.tenantId)!.push(chunk);
  }

  /** Queries strictly within the authenticated tenant shard. */
  searchIsolated(tenantId: string, query: string): string[] {
    const shard = this.shards.get(tenantId);
    if (!shard) return [];
    const tokens = query.toLowerCase().split(" ");
    return shard
      .filter((c) => tokens.some((token) => c.textContent.toLowerCase().includes(token)))
      .map((c) => c.textContent);
  }
}

const store = new ShardedVectorStore();
let activeTenantId: string;

const queryTenantShard = tool({
  description: "Retrieves chunks strictly bounded by the authenticated tenant shard.",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => store.searchIsolated(activeTenantId, query),
});

const FilteredSearchResponseSchema = z.object({
  query: z.string(),
  tenantId: z.string(),
  matchingChunks: z.array(z.string()),
  isolationVerified: z.boolean().describe("Confirms zero leakage from other tenant partitions."),
});

async function main(): Promise<void> {
  console.log("--- Test 1: Sharded Vector Partitioning & Tenant Isolation ---");

  // Seed Tenant A records (an internal treasury desk).
  store.insert({
    tenantId: "tenant_internal_treasury",
    chunkId: "chk_01",
    textContent: "Internal treasury managed balances reached record yields of 4.35% in Q3 2026.",
  });

  // Seed Tenant B records (an unrelated external fund client).
  store.insert({
    tenantId: "tenant_external_fund",
    chunkId: "chk_02",
    textContent: "External fund private allocation: £45M in European commercial paper.",
  });

  activeTenantId = "tenant_internal_treasury";
  const userQuery = "What are the latest treasury yields?";
  console.log(`Executing query for tenant: '${activeTenantId}'`);

  const { toolResults } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an enterprise multi-tenant security agent. Retrieve data solely using the queryTenantShard " +
      "tool. Enforce strict tenant boundary checks and verify isolation.",
    tools: { queryTenantShard },
    stopWhen: stepCountIs(3),
    prompt: userQuery,
  });

  const rawMatchingChunks = toolResults.flatMap((r) => r.output as string[]);
  const { object: data } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: FilteredSearchResponseSchema,
    prompt:
      `Extract the structured search response for query "${userQuery}" and tenantId "${activeTenantId}" from ` +
      `these raw retrieved chunks (preserve them exactly, don't paraphrase): ${JSON.stringify(rawMatchingChunks)}`,
  });

  console.log("\n=== Validated Query Output ===");
  console.log(`Tenant ID: ${data.tenantId}`);
  console.log(`Retrieved Records: ${JSON.stringify(data.matchingChunks)}`);
  console.log(`Boundary Isolation Verified: ${data.isolationVerified}`);

  console.log("\n--- Verification: No Cross-Tenant Leakage Actually Occurred ---");
  const otherTenantChunk = "External fund private allocation: £45M in European commercial paper.";
  if (data.matchingChunks.includes(otherTenantChunk)) {
    throw new Error("BUG: Tenant B's private data leaked into Tenant A's query results.");
  }
  if (!data.matchingChunks.some((chunk) => chunk.includes("4.35%"))) {
    throw new Error("BUG: Tenant A's own real record is missing from its own results.");
  }
  console.log(
    "[VERIFIED] Tenant A's real record is present, and Tenant B's private data never appeared - isolation is genuinely enforced.",
  );

  console.log("\n--- Verification: The Agent's Self-Reported tenantId Field Is Accurate ---");
  if (data.tenantId !== activeTenantId) {
    console.log(
      `[FINDING] The agent's reported tenantId ('${data.tenantId}') does NOT match the real active tenant ('${activeTenantId}') - ` +
        "the DATA isolation held (verified above), but this self-reported field is unreliable and should never be trusted as an " +
        "audit record on its own.",
    );
  } else {
    console.log(
      `[VERIFIED] The agent's reported tenantId ('${data.tenantId}') correctly matches the real active tenant.`,
    );
  }

  console.log("\n--- Test 2: Direct Store-Level Cross-Tenant Query Attempt ---");
  const crossTenantResults = store.searchIsolated("tenant_external_fund", "treasury yields");
  if (crossTenantResults.length !== 0) {
    throw new Error(
      `BUG: querying Tenant B's shard for Tenant A's query terms returned results: ${JSON.stringify(crossTenantResults)}`,
    );
  }
  console.log(
    "[VERIFIED] Querying Tenant B's shard for Tenant A's query terms returns nothing - the partition boundary is structural, not just prompt-level guidance.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
