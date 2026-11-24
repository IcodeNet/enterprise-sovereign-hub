Day 42's TypeScript port builds the same compaction pipeline and independently reproduces the identical honest negative result: the compacted digest was larger than the raw history it replaced, confirming the finding isn't a Python-specific fluke.

---

## Memory & Context Management — Day 42 (TS Port): Agentic Self-Compaction & Hierarchical Memory Summarization

### The Problem We're Solving

Same problem as the Python lesson: passing an ever-growing raw conversation history into every prompt raises cost and latency. Compaction folds older turns into a dense summary while keeping recent turns verbatim.

Focus: the same threshold-triggered compaction pipeline, built with `generateObject`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the digest output shape (`class CompactedMemorySummary(BaseModel)`) | the digest output shape (`const CompactedMemorySummarySchema = z.object({...})`) |
| the session memory class (`class CompactableSessionMemory`) | the session memory class (`class CompactableSessionMemory`) |
| splitting older vs. recent turns (`self.history[:-2]`, `self.history[-2:]`) | splitting older vs. recent turns (`this.history.slice(0, -2)`, `this.history.slice(-2)`) |
| running the compactor (`await compactor_agent.run(...)`) | running the compactor (`await generateObject({ model, schema, prompt })`) |
| the running digest string (`self.active_summary`) | the running digest string (`this.activeSummary`) |

### Step 1: Build the Pipeline

Structurally identical to the Python side, same threshold check and same split-and-summarize logic.

### Step 2: Run and Verify - the Same Honest Negative Result, Independently Confirmed

```
[COMPACTION TRIGGERED] Turn count (6) reached threshold (4).
 [COMPACTED CONTEXT] New digest length: 383 chars

Raw history turns: 6 | Post-compaction turns kept verbatim: 2
Raw content chars: 383 | Compacted content chars: 496
```

Same real finding as Python: the compacted content (496 characters) was larger than the raw uncompacted history (383 characters), on the identical test conversation. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

Note the exact numbers differ slightly from the Python run (426 vs 383 digest length, 539 vs 496 total) - genuine run-to-run model output variance, same category as Day 37's latency variance - but the DIRECTION of the finding (compacted > raw, at this conversation size) held in both languages, which is the more important confirmation than matching exact character counts.

---

## Best Practices

- **When a surprising finding appears in one language, reproduce it independently in the port before treating it as established.** A single run in one language could plausibly be a fluke of that particular model response; getting the same DIRECTION of result (compacted content larger than raw, not just similar) in a completely independent implementation is real confirmation the finding is structural, not incidental.
- **Don't expect exact numeric parity between two languages' LLM-based pipelines - expect DIRECTIONAL parity.** The precise character counts differ because the underlying model call's exact wording differs between runs; what should match (and did) is the qualitative conclusion.

## Why This Port Matters in Production

Independently reproducing the SAME surprising negative finding, with different exact numbers but the same direction, in a second language is stronger evidence than either result alone - it rules out "this was just how this particular Python run's model response happened to come out" as an explanation, and confirms the underlying dynamic (small-conversation compaction overhead) is real.
