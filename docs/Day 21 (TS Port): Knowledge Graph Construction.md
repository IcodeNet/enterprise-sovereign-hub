This is Day 21's TypeScript side - the same explicit-relationship graph pattern, using `graphology`, JavaScript's real, established graph library - plus a genuine broken-dependency bug found and fixed along the way.

---

## Graph RAG — Day 21 (TS Port): Knowledge Graph Construction

### The Problem We're Solving

Same problem as the Python lesson: a multi-hop relational question ("what depends on X and was affected by Y") needs an actual graph of explicit relationships, not a similarity search over embeddings.

Focus: the same triplet-extraction and graph-traversal pattern in TypeScript, using `graphology`
Time investment: 20 minutes (includes a real broken-dependency fix)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| one fact from the text (`class EntityRelationTriplet(BaseModel)`) | one fact from the text (`const EntityRelationTripletSchema = z.object({...})`) |
| the graph library (`nx.DiGraph()` from networkx) | the graph library (`new MultiDirectedGraph()` from graphology) |
| adding facts to the graph (`self.graph.add_edge(sub, obj, relation=pred)`) | adding facts to the graph (`this.graph.addEdge(sub, obj, { relation: pred })`) |
| reading an entity's links (`self.graph.edges(entity, data=True)`) | reading an entity's links (`this.graph.forEachOutEdge(normalizedEntity, ...)`) |
| extracting the facts (`await graph_extractor_agent.run(...)`) | extracting the facts (`await generateObject({ model: openai("gpt-4o"), schema: ExtractedKnowledgeGraphSchema, ... })`) |
| running the whole pipeline (`run_graph_rag_pipeline(text_corpus, query_entity)`) | running the whole pipeline (`runGraphRagPipeline(textCorpus, queryEntity)`) |

### Step 1: Install Graph Dependencies

```bash
cd apps/web
npm install graphology --legacy-peer-deps
```

**A real bug was hit immediately after this install**: `graphology`'s own type declarations import from a separate package, `graphology-types`, which had installed as a COMPLETELY EMPTY directory (no `package.json`, no `.d.ts` file - `npm ls graphology-types` showed `(empty)`). TypeScript failed with a wall of "Property 'hasNode' does not exist" errors that looked like a wrong API, but were actually caused by the underlying type definitions never having loaded at all. The fix was a direct, explicit install of the broken sub-dependency:

```bash
npm install graphology-types --legacy-peer-deps
```

After that, `graphology-types/index.d.ts` was present and every type error resolved immediately with no code changes needed - the API usage had been correct all along.

### Step 2: Create the Source File

Inside `apps/web/src/retrieval/`, create:
`knowledge-graph-rag.ts`

### Step 3: Add the Source Code

```typescript
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
    system: "We reason over Knowledge Graph triplets to answer complex multi-hop engineering questions.",
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
```

### Step 4: Run and Verify

```bash
npx tsx src/retrieval/knowledge-graph-rag.ts
```

A real run correctly extracted 5 genuine triplets from the sample text and correctly traversed only the 2 edges actually OUT of "Sovereign Intelligence Hub", producing a correct multi-hop synthesis - the same shape of result the Python lesson found, using a genuinely different but equally real graph library.

---

## Best Practices

- **An empty package directory that still passes `npm install` without error is a real, silent failure mode - check `npm ls <package>` for `(empty)` when a dependency's types mysteriously don't resolve.** A wall of "Property does not exist" TypeScript errors on a library you're using correctly is a strong signal to check whether the underlying package actually installed its files, not just its manifest entry.
- **`graphology`'s dedicated subclasses (`MultiDirectedGraph`, `DirectedGraph`, etc.) are the intended way to configure directed/multi-edge behavior** - not an options object passed to the base `Graph` constructor, which is a common mistake coming from libraries (like some JS graph libraries) that DO use that pattern.
- **Normalize entity names before adding graph nodes** - same discipline as the Python lesson, for the same reason: inconsistent casing/whitespace would silently create duplicate nodes for what should be the same entity.

## Why This Matters in Production

A dependency that installs cleanly but leaves a sub-package empty is a real, if rare, failure mode that produces confusing type errors pointing at the wrong cause. Checking `npm ls <package>` for `(empty)` entries is a fast, direct way to rule this out before spending time debugging code that was actually correct all along.
