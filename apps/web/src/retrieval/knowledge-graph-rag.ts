import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { MultiDirectedGraph } from "graphology";
import { z } from "zod";

const EntityRelationTripletSchema = z.object({
  subject: z.string().describe("The source entity (e.g., 'Vercel AI SDK')."),
  predicate: z.string().describe("The relationship link (e.g., 'PROVIDES_TYPE_SAFETY_FOR')."),
  object: z.string().describe("The target entity (e.g., 'Sovereign Intelligence Hub')."),
});

const ExtractedKnowledgeGraphSchema = z.object({
  triplets: z.array(EntityRelationTripletSchema),
});

const GraphQueryAnswerSchema = z.object({
  relationalPath: z.array(z.string()).describe("The graph traversal path used."),
  finalAnswer: z.string().describe("The synthesized relational answer."),
});

type EntityRelationTriplet = z.infer<typeof EntityRelationTripletSchema>;

// Unlike Day 4/14's vector search, which finds text that reads as similar
// in MEANING, a knowledge graph stores EXPLICIT relationships extracted as
// (Subject -> Predicate -> Object) triplets. graphology is the real,
// well-established JS graph library - the direct equivalent of Python's
// networkx used here, not an invented substitute.
class LocalKnowledgeGraph {
  private readonly graph = new MultiDirectedGraph<{}, { relation: string }>();

  addTriplets(triplets: EntityRelationTriplet[]): void {
    for (const t of triplets) {
      const sub = t.subject.toLowerCase().trim();
      const obj = t.object.toLowerCase().trim();
      const pred = t.predicate.toUpperCase().trim();

      if (!this.graph.hasNode(sub)) this.graph.addNode(sub);
      if (!this.graph.hasNode(obj)) this.graph.addNode(obj);
      this.graph.addEdge(sub, obj, { relation: pred });
    }
  }

  getSubgraphContext(entity: string): string {
    const normalizedEntity = entity.toLowerCase().trim();
    if (!this.graph.hasNode(normalizedEntity)) {
      return "No relational graph context found.";
    }

    const contextLines: string[] = [];
    this.graph.forEachOutEdge(normalizedEntity, (_edge, attributes, source, target) => {
      contextLines.push(`(${source}) --[${attributes.relation}]--> (${target})`);
    });
    return contextLines.join("\n");
  }
}

async function runGraphRagPipeline(textCorpus: string, queryEntity: string) {
  console.log("Step 1: Extracting Knowledge Graph Triplets from text corpus...");

  const { object: extractedData } = await generateObject({
    model: openai("gpt-4o"),
    schema: ExtractedKnowledgeGraphSchema,
    system:
      "We are a knowledge graph architect. " +
      "Extract explicit entities and relationships as (Subject -> Predicate -> Object) triplets.",
    prompt: `Extract graph triplets from: ${textCorpus}`,
  });

  console.log("\n--- Extracted Relational Triplets ---");
  const kg = new LocalKnowledgeGraph();
  kg.addTriplets(extractedData.triplets);

  for (const t of extractedData.triplets) {
    console.log(` (${t.subject}) --[${t.predicate}]--> (${t.object})`);
  }

  console.log(`\nStep 2: Traversing Knowledge Graph for query entity: '${queryEntity}'...`);
  const graphContext = kg.getSubgraphContext(queryEntity);
  console.log(`Graph Context Retrieved:\n${graphContext}`);

  console.log("\nStep 3: Synthesizing multi-hop graph answer...");
  const synthesisPrompt = `Graph Triplet Context:\n${graphContext}\n\nAnswer query for entity: ${queryEntity}`;

  const { object: answerData } = await generateObject({
    model: openai("gpt-4o"),
    schema: GraphQueryAnswerSchema,
    system:
      "We reason over Knowledge Graph triplets to answer complex multi-hop engineering questions.",
    prompt: synthesisPrompt,
  });

  return answerData;
}

async function main() {
  const sampleText =
    "The Sovereign Intelligence Hub is built by Byron. " +
    "The Sovereign Intelligence Hub uses the Vercel AI SDK for type safety. " +
    "The Vercel AI SDK enforces strict output validation with OpenTelemetry observability.";

  const result = await runGraphRagPipeline(sampleText, "Sovereign Intelligence Hub");

  console.log("\n--- Final Graph RAG Synthesis ---");
  console.log(`Traversal Path: ${JSON.stringify(result.relationalPath)}`);
  console.log(`Synthesized Answer: ${result.finalAnswer}`);
}

main().catch(console.error);
