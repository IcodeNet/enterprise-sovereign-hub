Day 49 evicts and re-indexes only the stale chunks tied to one modified entity, then recalibrates hybrid search scoring with Reciprocal Rank Fusion (RRF) - and directly proves the eviction is genuinely targeted, not a full rebuild in disguise.

---

## Retrieval & Search — Day 49: Dynamic Vector Cache Invalidation with Reciprocal Rank Fusion (RRF)

### The Problem We're Solving

In production RAG (Retrieval-Augmented Generation) platforms, source documents update frequently - product specs, bond curves, internal policies. Re-indexing the ENTIRE vector collection every time one document changes causes severe latency spikes and burns compute for no reason. The fix: identify all the chunks tied to the ONE modified entity, purge only those, insert the fresh replacement chunks, and recalibrate search scoring - all without touching anything unrelated.

RRF (Reciprocal Rank Fusion) is the scoring layer that makes hybrid search possible: it combines a dense (semantic/embedding-based) ranking and a sparse (keyword/BM25-style) ranking into one score, using each chunk's RANK POSITION in each list rather than its raw score - which means it works even when the two rankings' raw scores aren't on comparable scales.

Focus: targeted cache invalidation plus RRF-based recalibration, with direct proof the eviction is genuinely scoped
Time investment: 15 minutes

### Step 1: Build the Store

`apps/ai-engine/src/retrieval/cache_invalidator.py`'s `HybridVectorStore` keeps chunks keyed by ID, tagged with an `entity_key` (e.g. an ISIN bond code). `invalidate_entity()` removes only the chunks matching that key:

```python
def invalidate_entity(self, entity_key: str) -> List[str]:
    """Evicts all chunks mapped to a modified entity key."""
    keys_to_remove = [cid for cid, chunk in self.store.items() if chunk.entity_key == entity_key]
    for cid in keys_to_remove:
        del self.store[cid]
    return keys_to_remove
```

### Step 2: Verify the Eviction Is Genuinely Targeted

The source's own demo runs the invalidate-then-reindex flow and just prints the resulting search results - it never explicitly asserts that the UNRELATED chunk (the US Treasury entry) survived untouched. Added a direct check: after invalidating the GB Gilt entity, the US Treasury chunk must still be present, the stale GB Gilt chunk must be gone, and the new GB Gilt chunk must be indexed.

### Step 3: Run and Verify - Real Results

```
Top query result prior to update:
{'chunk_id': 'chunk_01', 'content': 'UK Gilt 2026 Yield is set at 3.85%.', 'rrf_score': 0.03279}

[EVENT]: Update received for 'ISIN_GB00BM8Z2S21'. Invalidating stale chunks...
Purged Chunks: ['chunk_01']

Top query result after invalidation & recalibration:
 - [chunk_01_v2] (RRF: 0.03279): UK Gilt 2026 Yield updated to 4.15% post-BoE announcement.
 - [chunk_02] (RRF: 0.03226): US Treasury 10Y Yield is set at 4.22%.

[VERIFIED] Store contains exactly ['chunk_01_v2', 'chunk_02'] - stale chunk gone, unrelated chunk untouched, new chunk present.
[VERIFIED] Top-ranked chunk after recalibration is 'chunk_01_v2', consistent with its higher dense AND sparse scores.
```

Genuinely confirmed: only the one stale chunk was purged, the unrelated Treasury chunk was never touched, and the RRF score correctly reflects the new chunk's combined dense+sparse rank advantage.

---

## Best Practices

- **Directly assert the unrelated data survived, don't just eyeball the query results.** A search result LOOKING correct after an update doesn't prove the invalidation was scoped correctly - the unrelated chunk could theoretically have been dropped and re-added by some other path and you'd never notice from search output alone. Checking the store's actual key set closes that gap.
- **RRF's rank-based fusion (not raw-score averaging) is what lets dense and sparse signals combine safely** even when their underlying scores live on different scales (a cosine similarity vs. a BM25 score aren't directly comparable numbers) - fusing by RANK POSITION sidesteps that scale mismatch entirely.

## Why This Matters in Production

A cache invalidation system that "usually scopes correctly" but occasionally touches unrelated data is a subtle, hard-to-catch class of bug - it silently degrades retrieval quality for documents nobody even changed. Explicitly proving the untouched side of an update, not just the changed side, is what actually catches that class of regression before it reaches a real index.
