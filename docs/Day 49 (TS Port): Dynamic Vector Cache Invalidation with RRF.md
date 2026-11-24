Day 49's TypeScript port reproduces the exact same targeted-invalidation and RRF-recalibration logic with native Maps, and matches Python's RRF scores exactly to 5 decimal places.

---

## Retrieval & Search — Day 49 (TS Port): Dynamic Vector Cache Invalidation with Reciprocal Rank Fusion (RRF)

### The Problem We're Solving

Same problem as the Python lesson: evict and re-index only the chunks tied to one modified entity, then recalibrate hybrid search scoring, without a full index rebuild.

Focus: the same targeted-eviction + RRF algorithm, built with a native `Map<string, DocumentChunk>`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the chunk store (`self.store: Dict[str, DocumentChunk]`) | the chunk store (`readonly store = new Map<string, DocumentChunk>()`) |
| targeted eviction (`invalidate_entity(entity_key)`) | targeted eviction (`invalidateEntity(entityKey)`) |
| the RRF scorer (`search_with_rrf(query)`) | the RRF scorer (`searchWithRrf()`) |
| the fusion formula (`1.0 / (self.rrf_k + rank + 1)`, summed across both rankings) | the fusion formula (`1 / (this.rrfK + rank + 1)`, summed identically) |

### Step 1: Build the Store

Structurally identical to Python: a `Map` keyed by chunk ID, an `entityKey` tag on each chunk, and `invalidateEntity()` filtering + deleting only the matching keys.

### Step 2: Run and Verify - Exact-Value Match with Python

```
Top query result prior to update:
{ chunkId: 'chunk_01', content: 'UK Gilt 2026 Yield is set at 3.85%.', rrfScore: 0.03279 }

[EVENT]: Update received for 'ISIN_GB00BM8Z2S21'. Invalidating stale chunks...
Purged Chunks: ["chunk_01"]

Top query result after invalidation & recalibration:
 - [chunk_01_v2] (RRF: 0.03279): UK Gilt 2026 Yield updated to 4.15% post-BoE announcement.
 - [chunk_02] (RRF: 0.03226): US Treasury 10Y Yield is set at 4.22%.

[VERIFIED] Store contains exactly ["chunk_01_v2","chunk_02"] - stale chunk gone, unrelated chunk untouched, new chunk present.
[VERIFIED] Top-ranked chunk after recalibration is 'chunk_01_v2', consistent with its higher dense AND sparse scores.
```

The RRF scores (`0.03279`, `0.03226`) match Python's output to the same 5 decimal places - exactly what's expected for a deterministic algorithm with no LLM call involved, the same category Day 46's deadlock detector fell into. `tsc --noEmit` clean after fixing 4 `unicorn/no-array-sort` findings (switched to `.toSorted()`, which returns a new array instead of mutating in place - the correct choice here since `denseSorted`/`sparseSorted` are both derived from the same `chunks` array and must not interfere with each other). `oxlint` clean. `npm audit` unchanged.

---

## Best Practices

- **`.toSorted()` over `.sort()` when the same source array feeds two independently-sorted derivations.** `chunks.sort()` mutates the array in place - calling it twice on the same array (once for dense order, once for sparse order) would have silently corrupted the second sort by inheriting the first sort's order as a starting state. `.toSorted()` returns a fresh array each time, avoiding that class of bug entirely.
- **Deterministic algorithms should match cross-language, digit-for-digit, not just directionally.** Getting `0.03279`/`0.03226` exactly matching Python (not merely "chunk_01_v2 ranked first in both") is itself the correct bar for this category of lesson.

## Why This Port Matters in Production

An algorithm this precise (RRF's fusion score depends on exact rank positions and a fixed constant) is exactly the kind of logic where "close enough" between two language ports isn't good enough - a subtle off-by-one in how ranks are counted (0-indexed vs 1-indexed) would silently shift every score by a small but real amount without ever throwing an error. Matching to 5 decimal places is the actual proof the port is faithful.
