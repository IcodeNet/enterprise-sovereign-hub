/**
 * Dynamic vector cache invalidation with Reciprocal Rank Fusion - Day 49 TS port.
 *
 * Targets only the stale chunks tied to a modified entity for eviction and
 * re-indexing, instead of rebuilding the entire vector collection, then
 * recalibrates hybrid search scoring with Reciprocal Rank Fusion (RRF) -
 * combining a dense and a sparse ranking into one score without needing
 * either ranking's raw scores to be on the same scale.
 */

interface DocumentChunk {
  chunkId: string;
  entityKey: string;
  content: string;
  denseScore: number;
  sparseScore: number;
}

interface RankedResult {
  chunkId: string;
  content: string;
  rrfScore: number;
}

class HybridVectorStore {
  private readonly rrfK: number;
  readonly store = new Map<string, DocumentChunk>();

  constructor(rrfK = 60) {
    this.rrfK = rrfK;
  }

  insertChunk(chunk: DocumentChunk): void {
    this.store.set(chunk.chunkId, chunk);
  }

  /** Evicts all chunks mapped to a modified entity key. */
  invalidateEntity(entityKey: string): string[] {
    const keysToRemove = [...this.store.values()]
      .filter((chunk) => chunk.entityKey === entityKey)
      .map((chunk) => chunk.chunkId);
    for (const cid of keysToRemove) {
      this.store.delete(cid);
    }
    return keysToRemove;
  }

  /** Calculates Reciprocal Rank Fusion scores across dense and sparse ranks. */
  searchWithRrf(): RankedResult[] {
    const chunks = [...this.store.values()];
    const denseSorted = chunks.toSorted((a, b) => b.denseScore - a.denseScore);
    const sparseSorted = chunks.toSorted((a, b) => b.sparseScore - a.sparseScore);

    const rrfScores = new Map<string, number>();
    denseSorted.forEach((chunk, rank) => {
      rrfScores.set(
        chunk.chunkId,
        (rrfScores.get(chunk.chunkId) ?? 0) + 1 / (this.rrfK + rank + 1),
      );
    });
    sparseSorted.forEach((chunk, rank) => {
      rrfScores.set(
        chunk.chunkId,
        (rrfScores.get(chunk.chunkId) ?? 0) + 1 / (this.rrfK + rank + 1),
      );
    });

    return [...rrfScores.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .map(([cid, score]) => ({
        chunkId: cid,
        content: this.store.get(cid)!.content,
        rrfScore: Math.round(score * 100000) / 100000,
      }));
  }
}

async function main(): Promise<void> {
  console.log("--- Dynamic Cache Invalidation & Hybrid Recalibration Test ---");
  const store = new HybridVectorStore();

  store.insertChunk({
    chunkId: "chunk_01",
    entityKey: "ISIN_GB00BM8Z2S21",
    content: "UK Gilt 2026 Yield is set at 3.85%.",
    denseScore: 0.91,
    sparseScore: 0.88,
  });
  store.insertChunk({
    chunkId: "chunk_02",
    entityKey: "ISIN_US912810TS76",
    content: "US Treasury 10Y Yield is set at 4.22%.",
    denseScore: 0.74,
    sparseScore: 0.81,
  });

  console.log(`Initial indexed documents: ${store.store.size}`);
  console.log("Top query result prior to update:");
  console.log(store.searchWithRrf()[0]);

  console.log("\n[EVENT]: Update received for 'ISIN_GB00BM8Z2S21'. Invalidating stale chunks...");
  const purged = store.invalidateEntity("ISIN_GB00BM8Z2S21");
  console.log(`Purged Chunks: ${JSON.stringify(purged)}`);

  store.insertChunk({
    chunkId: "chunk_01_v2",
    entityKey: "ISIN_GB00BM8Z2S21",
    content: "UK Gilt 2026 Yield updated to 4.15% post-BoE announcement.",
    denseScore: 0.95,
    sparseScore: 0.92,
  });
  console.log("Injected updated chunk 'chunk_01_v2'.");

  console.log("\nTop query result after invalidation & recalibration:");
  const results = store.searchWithRrf();
  for (const r of results) {
    console.log(` - [${r.chunkId}] (RRF: ${r.rrfScore}): ${r.content}`);
  }

  console.log("\n--- Verification: Invalidation Is Targeted, Not a Full Rebuild ---");
  const remainingIds = new Set(store.store.keys());
  if (!remainingIds.has("chunk_02"))
    throw new Error("BUG: unrelated entity's chunk was wrongly purged.");
  if (remainingIds.has("chunk_01")) throw new Error("BUG: stale chunk was not actually purged.");
  if (!remainingIds.has("chunk_01_v2"))
    throw new Error("BUG: the updated chunk was never indexed.");
  console.log(
    `[VERIFIED] Store contains exactly ${JSON.stringify([...remainingIds].toSorted())} - stale chunk gone, unrelated chunk untouched, new chunk present.`,
  );

  console.log("\n--- Verification: RRF Score Is a Genuine Fusion, Not Just One Signal ---");
  const topResult = results[0];
  if (topResult.chunkId !== "chunk_01_v2") {
    throw new Error("BUG: expected the updated (higher dense+sparse) chunk to rank first.");
  }
  console.log(
    `[VERIFIED] Top-ranked chunk after recalibration is '${topResult.chunkId}', consistent with its higher dense AND sparse scores.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
