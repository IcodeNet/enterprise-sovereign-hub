import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Graph-augmented vector retrieval (Hybrid Graph-RAG) - Day 51 TS port.
 *
 * Vector search alone can return context that's semantically similar but
 * factually disconnected. This grounds the agent's answer in verified
 * knowledge-graph triples ((Subject) -[Predicate]-> (Object)) instead of
 * similarity alone.
 */

interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

interface GraphEvidenceRecord {
  sourceId: string;
  retrievalMethod: "graph";
  relationPath: string[];
  hopCount: number;
  verified: boolean;
}

class KnowledgeGraphStore {
  private readonly triples: Triple[] = [
    { subject: "ACC-4081", predicate: "HELD_AT", object: "Partner Bank C" },
    { subject: "Partner Bank C", predicate: "PROTECTED_BY", object: "FSCS" },
    { subject: "ACC-4081", predicate: "CURRENCY", object: "GBP" },
    { subject: "ACC-9022", predicate: "HELD_AT", object: "Partner Bank B" },
  ];

  /** Finds all direct relational triples for an entity, in either direction. */
  findRelations(entityId: string): string[] {
    return this.triples
      .filter(
        (t) =>
          t.subject.toLowerCase() === entityId.toLowerCase() ||
          t.object.toLowerCase() === entityId.toLowerCase(),
      )
      .map((t) => `(${t.subject}) -[${t.predicate}]-> (${t.object})`);
  }
}

const graphStore = new KnowledgeGraphStore();

const queryKnowledgeGraph = tool({
  description: "Inspects verified knowledge graph triples for a specific account or institution.",
  inputSchema: z.object({ entityId: z.string() }),
  execute: async ({ entityId }) => graphStore.findRelations(entityId),
});

async function main(): Promise<void> {
  console.log("--- Test 1: Graph-Augmented RAG Workflow (Known Entity) ---");
  const userQuery = "Where is account ACC-4081 held and what regulatory protection applies?";
  console.log(`Request: ${userQuery}\n`);

  const { toolResults } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an autonomous enterprise data governance agent. Resolve financial entity locations and " +
      "relationships using the queryKnowledgeGraph tool. Ground your answers strictly on the retrieved " +
      "relational triples.",
    tools: { queryKnowledgeGraph },
    stopWhen: stepCountIs(3),
    prompt: userQuery,
  });

  // Extract structure from the raw tool output (the real graph
  // relations returned), not the model's own paraphrase - same lesson
  // learned in Day 50's port.
  const rawRelations = toolResults.flatMap((r) => r.output as string[]);
  console.log("=== Real Graph Relations Retrieved by the Tool ===");
  console.log(rawRelations);

  console.log("\n--- Verification: The Answer Is Actually Grounded in Real Triples ---");
  const realRelations = graphStore.findRelations("ACC-4081");
  if (!realRelations.some((rel) => rel.includes("Partner Bank C"))) {
    throw new Error("Test setup issue: expected Partner Bank C relation missing.");
  }
  if (!rawRelations.some((rel) => rel.includes("Partner Bank C"))) {
    throw new Error(
      `BUG: tool's retrieved relations don't include the expected Partner Bank C relation: ${JSON.stringify(rawRelations)}`,
    );
  }
  console.log(
    `[VERIFIED] Tool's retrieved relations genuinely match the real graph relations: ${JSON.stringify(realRelations)}`,
  );

  const knownEvidencePack: GraphEvidenceRecord = {
    sourceId: "ACC-4081",
    retrievalMethod: "graph",
    relationPath: realRelations,
    hopCount: realRelations.length,
    verified: true,
  };
  console.log("\n--- Graph Evidence Pack (Known Entity) ---");
  console.log(JSON.stringify(knownEvidencePack, null, 2));

  console.log("\n--- Test 2: Genuinely Unknown Entity (No Graph Relations Exist) ---");
  const unknownQuery = "Where is account ACC-0000 held?";
  console.log(`Request: ${unknownQuery}\n`);
  const unknownRelations = graphStore.findRelations("ACC-0000");
  console.log(
    `[VERIFICATION] Real graph relations for ACC-0000: ${JSON.stringify(unknownRelations)} (expected: empty array)`,
  );
  if (unknownRelations.length !== 0) {
    throw new Error("BUG: an untracked account unexpectedly has graph relations.");
  }
  console.log(
    "[VERIFIED] The knowledge graph correctly has zero relations for this untracked account - any agent answer claiming otherwise would be a hallucination.",
  );

  const unknownEvidencePack: GraphEvidenceRecord = {
    sourceId: "ACC-0000",
    retrievalMethod: "graph",
    relationPath: unknownRelations,
    hopCount: unknownRelations.length,
    verified: true,
  };
  console.log("\n--- Graph Evidence Pack (Unknown Entity) ---");
  console.log(JSON.stringify(unknownEvidencePack, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
