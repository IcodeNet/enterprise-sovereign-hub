import "dotenv/config";
import { Document, MetadataMode, VectorStoreIndex, Settings } from "llamaindex";
import { storageContextFromDefaults } from "llamaindex/storage";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { QdrantVectorStore } from "@llamaindex/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";

Settings.embedModel = new OpenAIEmbedding();

interface HybridEvidenceRecord {
  sourceId: string;
  retrievalMethod: "hybrid";
  fusionScore: number;
  denseRank?: number;
  sparseRank?: number;
  excerpt: string;
}

// A small enterprise knowledge base - deliberately including one document
// with a specific alphanumeric ID ("#AC-9042-X") that a pure semantic
// (meaning-based) search can genuinely struggle with, since an arbitrary
// code has no real "meaning" of its own to embed well. This is the exact
// retrieval failure mode hybrid search exists to cover.
const sampleDocs = [
  new Document({
    text: "A fintech platform specializes in savings accounts and payments.",
  }),
  new Document({
    text: "The Sovereign Intelligence Hub is built using Pydantic AI, FastMCP, LlamaIndex Workflows, and the Vercel AI SDK.",
  }),
  new Document({
    text: "Account ID #AC-9042-X requires multi-factor authentication and Guardrails AI output validation before any transaction.",
  }),
  new Document({
    text: "Hybrid retrieval uses Reciprocal Rank Fusion (RRF) to merge dense embeddings with sparse BM25 keyword matching.",
  }),
];

// A tiny sparse (keyword) search: counts overlapping words between the
// query and each document, completely independent of embeddings or
// meaning. This is deliberately dumb - the point isn't a sophisticated
// keyword algorithm, it's demonstrating a SECOND, genuinely different
// search strategy that dense search alone doesn't have: this will match
// "#AC-9042-X" literally, which an embedding-based search can miss if the
// arbitrary code doesn't embed near anything meaningful.
function sparseKeywordSearch(
  query: string,
  docs: Document[],
): Array<{ doc: Document; score: number }> {
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

// Reciprocal Rank Fusion: combines two separately-ranked result lists into
// one fused ranking, using only each result's RANK POSITION in its own
// list (1st, 2nd, 3rd...) rather than trying to compare two
// different scoring scales (cosine similarity vs. keyword count) directly
// against each other - which wouldn't be a fair comparison, since they
// measure completely different things.
function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; text: string }>>,
  k = 60,
): HybridEvidenceRecord[] {
  const scores = new Map<
    string,
    {
      excerpt: string;
      fusionScore: number;
      denseRank?: number;
      sparseRank?: number;
    }
  >();

  rankedLists.forEach((list, listIndex) => {
    list.forEach((item, rank) => {
      const contribution = 1 / (k + rank + 1);
      const existing = scores.get(item.id);
      const rankValue = rank + 1;
      scores.set(item.id, {
        excerpt: item.text,
        fusionScore: (existing?.fusionScore ?? 0) + contribution,
        denseRank: listIndex === 0 ? rankValue : existing?.denseRank,
        sparseRank: listIndex === 1 ? rankValue : existing?.sparseRank,
      });
    });
  });

  return Array.from(scores.entries())
    .map(([sourceId, value]) => ({
      sourceId,
      retrievalMethod: "hybrid" as const,
      fusionScore: value.fusionScore,
      denseRank: value.denseRank,
      sparseRank: value.sparseRank,
      excerpt: value.excerpt,
    }))
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

  const denseRanked = denseResults.map((r) => {
    // eslint-disable-next-line no-underscore-dangle -- llamaindex's own BaseNode.id_ property name
    const nodeId = r.node.id_;
    return { id: nodeId, text: r.node.getContent(MetadataMode.NONE) };
  });
  const sparseRanked = sparseResults.map((r) => {
    // eslint-disable-next-line no-underscore-dangle -- llamaindex's own Document.id_ property name
    const docId = r.doc.id_;
    return { id: docId, text: r.doc.text };
  });

  const fusedEvidencePack = reciprocalRankFusion([denseRanked, sparseRanked]);

  console.log("\n--- Hybrid Search Results Received ---");
  fusedEvidencePack.slice(0, 2).forEach((result, idx) => {
    console.log(`\nResult [${idx + 1}] (Fusion Score: ${result.fusionScore.toFixed(4)}):`);
    console.log(`Content: ${result.excerpt}`);
  });

  console.log("\n--- Hybrid Evidence Pack ---");
  console.log(JSON.stringify(fusedEvidencePack.slice(0, 2), null, 2));
}

const sampleQuery =
  "What exact tools power the Sovereign Intelligence Hub and Account ID #AC-9042-X?";
runHybridRetrievalPipeline(sampleQuery).catch(console.error);
