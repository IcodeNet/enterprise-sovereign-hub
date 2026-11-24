Day 55's TypeScript port reproduces the identical SHA-256 hash-bucket sampling logic with Node's `crypto` module, and matches Python's observed rate and superset counts exactly.

---

## Observability & Eval Methodology — Day 55 (TS Port): Deterministic Hash-Based Sampling for Human Review Queues

### The Problem We're Solving

Same problem as the Python lesson: a human review queue's sampling decision needs to be reproducible per-item and accurate at scale, without stored state.

Focus: the same SHA-256 hash-bucket algorithm, built with `node:crypto`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the sampling decision (`should_sample(stable_id)`) | the sampling decision (`shouldSample(stableId)`) |
| the hash digest (`hashlib.sha256(stable_id.encode()).hexdigest()`) | the hash digest (`crypto.createHash("sha256").update(stableId).digest("hex")`) |
| the bucket integer (`int(digest[:8], 16)`) | the bucket integer (`Number.parseInt(digest.slice(0, 8), 16)`) |

### Step 1: Build the Sampler

Structurally identical: SHA-256 the stable ID, take the first 8 hex characters as an integer, compare its position in the 32-bit space against the configured rate.

### Step 2: Run and Verify - Exact-Value Match with Python

```
5 repeated calls for 'conv_9f3a2b7c': [false,false,false,false,false]
[VERIFIED] All 5 calls for the same ID produced the identical decision (false) - the sampler is genuinely deterministic.

Target rate: 0.100 | Observed rate over 50,000 IDs: 0.1006
[VERIFIED] Observed rate (0.1006) is within 1% of the target (0.100) across 50,000 distinct IDs.

[VERIFIED] All 5,030 IDs sampled at 10% are also included in the 10,021 IDs sampled at 20% - raising the rate is a strict superset, never a disjoint re-roll.
```

Every number matches Python exactly: `0.1006` observed rate, `5,030` and `10,021` sampled counts - the correct bar for a deterministic, no-LLM algorithm (same category as Days 46 and 49). Both languages' SHA-256 implementations, given the same input string, produce byte-identical digests, so there's no room for divergence here. `tsc --noEmit` and `oxlint` both clean with no fixes needed.

---

## Best Practices

- **SHA-256 is a cross-language-deterministic primitive** - the same input string produces the same digest in any correct implementation, in any language. This is exactly why hash-based sampling is a genuinely portable pattern: a Python service and a TypeScript service can independently compute the SAME sampling decision for the SAME conversation ID without ever communicating, which is a real operational advantage over any random-seed-based approach.
- **A no-LLM, cryptographically-grounded algorithm is the highest-confidence category of lesson to port.** No model variance, no framework API drift risk - the only thing that could differ between ports is a genuine implementation bug, and the exact-match numbers here confirm there wasn't one.

## Why This Port Matters in Production

If a review-sampling service exists in two different languages across two parts of a system (e.g. a Python data pipeline and a TypeScript API layer), both computing sampling decisions for the same conversation IDs, this exact-match result is the concrete proof that they'd agree with each other in production - a genuinely useful guarantee that a probabilistic-feeling pattern is actually fully deterministic and language-agnostic.
