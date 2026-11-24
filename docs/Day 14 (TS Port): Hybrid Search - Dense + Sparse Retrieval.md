This is Day 14's TypeScript side: the same dense + sparse fusion as the Python lesson, but with a genuinely different setup - LlamaIndex.TS's Qdrant client only supports a real server, not an embedded in-memory mode, and there's no built-in fusion retriever to reach for.

---

## Hybrid Search — Day 14 (TS Port): Dense + Sparse Retrieval Engine

### The Problem We're Solving

Same problem as the Python lesson: a pure meaning-based search can miss a document containing an exact ID or code that has no real semantic content of its own. The fix is the same - run a dense (embedding) search and a sparse (keyword) search separately, then fuse their two rankings with Reciprocal Rank Fusion.

Two real differences from the Python side, both discovered by trying the obvious approach first:
1. **`@qdrant/js-client-rest` only talks to a real Qdrant server over its REST API** - there is no embedded/in-memory client in this ecosystem the way Python's `qdrant-client` has one. This lesson runs a real local Qdrant server via Docker rather than pretending an in-memory option exists.
2. **LlamaIndex.TS has no built-in `QueryFusionRetriever`.** This lesson implements Reciprocal Rank Fusion directly as a small, explicit function - which is arguably MORE educational than calling a library function, since it shows exactly what RRF actually computes.

Focus: the same fusion technique, with a real search server and a hand-written RRF implementation
Time investment: 20 minutes (includes starting a local Qdrant container)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the vector store client (`AsyncQdrantClient(location=":memory:")`) | the vector store client (`new QdrantClient({ url: "http://localhost:6333" })`) |
| building the index (`VectorStoreIndex.from_documents([], storage_context=storage_context)` + `await index.ainsert_nodes(nodes)`) | building the index (`await VectorStoreIndex.fromDocuments(sampleDocs, { storageContext })`) |
| the dense retriever (`index.as_retriever(similarity_top_k=2)`) | the dense retriever (`index.asRetriever({ similarityTopK: 2 })`) |
| the rank-fusion step (`QueryFusionRetriever(retrievers=[dense_retriever], ...)`) | the rank-fusion step, hand-built (`reciprocalRankFusion([denseRanked, sparseRanked])` with `sparseKeywordSearch()`) |
| running the search (`await fusion_retriever.aretrieve(query)`) | running the search (`await denseRetriever.retrieve({ query })`, then fusing) |
| the score on each result (`node.score`) | the score on each result (`result.fusionScore`) |

### Step 1: Start a Local Qdrant Server

```bash
docker run -d --name esih-qdrant -p 6333:6333 qdrant/qdrant:latest
```

Verify it's up: `curl http://localhost:6333/collections` should return `{"result":{"collections":[]},"status":"ok"}`.

### Step 2: Install the Packages

Inside `apps/web`:

```bash
npm install @qdrant/js-client-rest @llamaindex/qdrant --legacy-peer-deps
```

*(Note: this pulled a moderate-severity denial-of-service advisory in a transitive WebSocket dependency (`undici`), which `npm audit fix` could not resolve due to the same recurring `@llamaindex/workflow-core` peer-dependency conflict from earlier days. This is a real, acknowledged trade-off: a moderate DoS in a dev-time dependency, not a critical RCE - worth knowing about, not worth blocking the lesson over.)*

### Step 3: Create the Source File

Inside `apps/web/src/retrieval/`, create:
`hybrid-search-engine.ts`

### Step 4: Add the Source Code

```typescript
import "dotenv/config";
import { Document, MetadataMode, VectorStoreIndex, Settings } from "llamaindex";
import { storageContextFromDefaults } from "llamaindex/storage";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { QdrantVectorStore } from "@llamaindex/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";

Settings.embedModel = new OpenAIEmbedding();

const sampleDocs = [
  new Document({ text: "A fintech platform specializes in savings accounts and payments." }),
  new Document({ text: "The Sovereign Intelligence Hub is built using Pydantic AI, FastMCP, LlamaIndex Workflows, and the Vercel AI SDK." }),
  new Document({ text: "Account ID #AC-9042-X requires multi-factor authentication and Guardrails AI output validation before any transaction." }),
  new Document({ text: "Hybrid retrieval uses Reciprocal Rank Fusion (RRF) to merge dense embeddings with sparse BM25 keyword matching." }),
];

// A tiny sparse (keyword) search: counts overlapping words between the
// query and each document, independent of embeddings or meaning.
function sparseKeywordSearch(query: string, docs: Document[]): Array<{ doc: Document; score: number }> {
  const queryTokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  return docs
    .map((doc) => {
      const text = doc.text.toLowerCase();
      const score = queryTokens.filter((token) => text.includes(token)).length;
      return { doc, score };
    })
    .filter((result) => result.score > 0)
    .toSorted((a, b) => b.score - a.score);
}

// Reciprocal Rank Fusion: combines two separately-ranked result lists using
// only each result's RANK POSITION in its own list, not its raw score.
function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; text: string }>>,
  k = 60,
): Array<{ id: string; text: string; fusionScore: number }> {
  const scores = new Map<string, { text: string; fusionScore: number }>();

  for (const list of rankedLists) {
    list.forEach((item, rank) => {
      const contribution = 1 / (k + rank + 1);
      const existing = scores.get(item.id);
      scores.set(item.id, { text: item.text, fusionScore: (existing?.fusionScore ?? 0) + contribution });
    });
  }

  return Array.from(scores.entries())
    .map(([id, value]) => ({ id, ...value }))
    .toSorted((a, b) => b.fusionScore - a.fusionScore);
}

async function runHybridRetrievalPipeline(query: string) {
  console.log("Step 1: Connecting to Qdrant server...");
  const collectionName = "sovereign_tech_docs_ts";
  const client = new QdrantClient({ url: "http://localhost:6333" });

  if (await client.collectionExists(collectionName).then((r) => r.exists)) {
    await client.deleteCollection(collectionName);
  }

  const vectorStore = new QdrantVectorStore({ collectionName, client });

  console.log("Step 2: Indexing documents into vector store (dense)...");
  const index = await VectorStoreIndex.fromDocuments(sampleDocs, {
    storageContext: await storageContextFromDefaults({ vectorStore }),
  });
  const denseRetriever = index.asRetriever({ similarityTopK: 2 });

  console.log(`Step 3: Executing Hybrid Search for query: '${query}'...`);
  const denseResults = await denseRetriever.retrieve({ query });
  const sparseResults = sparseKeywordSearch(query, sampleDocs);

  const denseRanked = denseResults.map((r) => ({ id: r.node.id_, text: r.node.getContent(MetadataMode.NONE) }));
  const sparseRanked = sparseResults.map((r) => ({ id: r.doc.id_, text: r.doc.text }));

  const fused = reciprocalRankFusion([denseRanked, sparseRanked]);

  console.log("\n--- Hybrid Search Results Received ---");
  fused.slice(0, 2).forEach((result, idx) => {
    console.log(`\nResult [${idx + 1}] (Fusion Score: ${result.fusionScore.toFixed(4)}):`);
    console.log(`Content: ${result.text}`);
  });
}

const sampleQuery = "What exact tools power the Sovereign Intelligence Hub and Account ID #AC-9042-X?";
runHybridRetrievalPipeline(sampleQuery).catch(console.error);
```

### Step 5: Run and Verify

```bash
cd apps/web
npx tsx src/retrieval/hybrid-search-engine.ts
```

A real run against the same query surfaced the identical two documents as the Python lesson: the account ID document and the tech-stack document - real, matching evidence that the fusion logic finds what a pure semantic search alone could miss.

Clean up the Qdrant container when done: `docker stop esih-qdrant && docker rm esih-qdrant`.

---


*(Sample names in this lesson's data, a bank name and an account id, were later replaced with generic ones; the outputs above show the new names in place of the originals.)*

## Best Practices

- **Check whether a TypeScript port of a Python-first library actually has feature parity before assuming it does.** `qdrant-client`'s Python version ships an embedded in-memory mode; `@qdrant/js-client-rest` does not - this is a genuine capability gap, not a bug, and building against the assumption it existed would have wasted real setup time.
- **When a library lacks a feature (like a fusion retriever), consider writing it directly rather than searching harder for a package that has it.** A ~15-line RRF implementation is simple enough that it's arguably a better lesson than a black-box library call would have been.
- **A moderate-severity dependency vulnerability isn't automatically a blocker - but it should be a documented, deliberate decision, not something skipped past silently.** This lesson explicitly names the DoS advisory and why it's an acceptable trade-off for a dev-only tool, rather than either blocking on it or ignoring it without comment.

## Why This Matters in Production

The same hybrid search failure-mode-coverage from Day 14's Python lesson now exists in TypeScript too, built with the tools this ecosystem actually provides rather than assuming Python-side feature parity everywhere. Recognizing a real gap (no embedded Qdrant, no built-in fusion retriever) early, and building around it deliberately, is what kept this lesson honest instead of quietly working differently than advertised.

## Density Add-On: Hybrid Evidence Pack Contract (TS)

Return structured evidence records for fused results.

Recommended fields
- `sourceId`
- `fusionScore`
- `denseRank`
- `sparseRank`
- `retrievalMethod`
- `excerpt`

Why this helps
- CI can assert retrieval behavior, not only final answer text.
- You can debug exact-ID misses by checking per-method rank.

Practice checkpoint
- Extend the RRF output type with rank fields.
- Print one JSON block for top results and verify fields are present.
