import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import Graph from "graphology";
import { z } from "zod";

/**
 * Dynamic entity-graph memory with relationship resolution - Day 34 TS port.
 *
 * Extracts entities and relationships from each new statement, then merges
 * them into one persistent graph so related facts accumulate and reinforce
 * each other over multiple sessions.
 */

const EntityExtractionSchema = z.object({
  entities: z.array(z.string()).describe("Unique entities identified in text."),
  relations: z
    .array(
      z.object({
        sourceEntity: z.string().describe("Canonical source entity name."),
        targetEntity: z.string().describe("Canonical target entity name."),
        relationship: z.string().describe("Action or link between entities."),
        confidence: z
          .number()
          .describe("Confidence weight between 0.0 and 1.0, default 1.0 if unstated."),
      }),
    )
    .describe("Extracted relational links."),
});

type EntityExtractionPayload = z.infer<typeof EntityExtractionSchema>;

function toCanonical(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

class DynamicEntityGraph {
  private graph = new Graph({ type: "directed" });

  updateGraph(payload: EntityExtractionPayload): void {
    for (const node of payload.entities) {
      const canonicalNode = toCanonical(node);
      if (!this.graph.hasNode(canonicalNode)) {
        this.graph.addNode(canonicalNode, { mentions: 1 });
      } else {
        this.graph.setNodeAttribute(
          canonicalNode,
          "mentions",
          (this.graph.getNodeAttribute(canonicalNode, "mentions") as number) + 1,
        );
      }
    }

    for (const rel of payload.relations) {
      const src = toCanonical(rel.sourceEntity);
      const tgt = toCanonical(rel.targetEntity);

      // If the relation already exists, increment edge weight; otherwise add a new edge.
      if (this.graph.hasEdge(src, tgt)) {
        const edge = this.graph.edge(src, tgt) as string;
        this.graph.setEdgeAttribute(
          edge,
          "weight",
          (this.graph.getEdgeAttribute(edge, "weight") as number) + rel.confidence,
        );
        this.graph.setEdgeAttribute(edge, "relation", rel.relationship);
      } else {
        this.graph.addEdge(src, tgt, { relation: rel.relationship, weight: rel.confidence });
      }
    }
  }

  queryEntityNeighborhood(entityName: string): string[] {
    const canonical = toCanonical(entityName);
    if (!this.graph.hasNode(canonical)) {
      return [`No graph knowledge found for entity '${canonical}'.`];
    }

    const insights: string[] = [];
    this.graph.forEachOutEdge(canonical, (_edge, attrs, _source, target) => {
      insights.push(
        `(${canonical}) -[${attrs.relation}]-> (${target}) [weight: ${(attrs.weight as number).toFixed(1)}]`,
      );
    });
    this.graph.forEachInEdge(canonical, (_edge, attrs, source) => {
      insights.push(
        `(${source}) -[${attrs.relation}]-> (${canonical}) [weight: ${(attrs.weight as number).toFixed(1)}]`,
      );
    });
    return insights;
  }
}

async function processAndLinkFact(
  graph: DynamicEntityGraph,
  newInformation: string,
): Promise<void> {
  console.log(`\nProcessing Statement: "${newInformation}"`);

  const { object: data } = await generateObject({
    model: openai("gpt-4o"),
    schema: EntityExtractionSchema,
    system:
      "We are a principal knowledge graph architect. Extract entities and relationships from input statements. " +
      "Always normalize entity names into clean, canonical titles (e.g. 'Byron' instead of 'me').",
    prompt: newInformation,
  });

  graph.updateGraph(data);
  console.log(`Extracted Entities: ${JSON.stringify(data.entities)}`);
  for (const rel of data.relations) {
    console.log(` -> Link: (${rel.sourceEntity}) -[${rel.relationship}]-> (${rel.targetEntity})`);
  }
}

async function main(): Promise<void> {
  const memoryGraph = new DynamicEntityGraph();

  await processAndLinkFact(
    memoryGraph,
    "Byron leads AI Engineering architecture at a fintech company and designs sovereign agent frameworks.",
  );

  await processAndLinkFact(
    memoryGraph,
    "The sovereign agent frameworks run on cloud container infrastructure with a type-safe agent library.",
  );

  console.log("\n=== Graph Memory Query for 'Byron' ===");
  const connections = memoryGraph.queryEntityNeighborhood("Byron");
  for (const conn of connections) {
    console.log(` ${conn}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
