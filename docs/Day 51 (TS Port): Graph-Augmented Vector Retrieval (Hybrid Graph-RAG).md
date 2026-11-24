Day 51's TypeScript port builds the identical triple store and grounding check, and found a genuinely richer real result: the model chose to make a 2-hop graph traversal Python's version never attempted.

---

## Retrieval & Search — Day 51 (TS Port): Graph-Augmented Vector Retrieval (Hybrid Graph-RAG)

### The Problem We're Solving

Same problem as the Python lesson: an agent's answer needs grounding in verified knowledge-graph triples, not vector similarity alone.

Focus: the same triple store and tool-based lookup, extracting structure from the RAW tool output (same lesson as Day 50's port)
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the triple store (`self.triples: List[Dict[str, str]]`) | the triple store (`private readonly triples: Triple[]`) |
| the relation lookup (`find_relations(entity_id)`) | the relation lookup (`findRelations(entityId)`) |
| grounding the answer in the graph (agent's own `output_type=GroundedEntityResolution`, injected `deps=graph_store`) | grounding the answer in the graph (extracting from raw `toolResults`, module-level `graphStore` closed over by the tool) |

### Step 1: Build the Triple Store

Structurally identical: an array of `{subject, predicate, object}` triples, filtered by whether the queried entity appears as either subject or object.

### Step 2: Run and Verify - A Genuinely Richer Result Than Python's

```
=== Real Graph Relations Retrieved by the Tool ===
[
  '(ACC-4081) -[HELD_AT]-> (Partner Bank C)',
  '(ACC-4081) -[CURRENCY]-> (GBP)',
  '(ACC-4081) -[HELD_AT]-> (Partner Bank C)',
  '(Partner Bank C) -[PROTECTED_BY]-> (FSCS)'
]

[VERIFIED] Tool's retrieved relations genuinely match the real graph relations: [...]

--- Test 2: Genuinely Unknown Entity (No Graph Relations Exist) ---
[VERIFICATION] Real graph relations for ACC-0000: [] (expected: empty array)
[VERIFIED] The knowledge graph correctly has zero relations for this untracked account - any agent answer claiming otherwise would be a hallucination.
```

A real, interesting cross-language difference: this port's agent chose to call the tool TWICE - once for `ACC-4081` (finding `HELD_AT Partner Bank C`), then again for `Partner Bank C` itself (finding `PROTECTED_BY FSCS`) - a genuine 2-hop graph traversal the user's question actually asked for ("what regulatory protection applies?"), which Python's single-call version never attempted. Both hops are verified as real, existing triples - not a hallucination, a genuinely more thorough answer. `tsc --noEmit` and `oxlint` both clean with no fixes needed. `npm audit` unchanged.

---


*(Sample names in this lesson's data, a bank name and an account id, were later replaced with generic ones; the outputs above show the new names in place of the originals.)*

## Best Practices

- **A cross-language difference in HOW THOROUGHLY the agent uses its own tools is a real, worth-reporting finding, not noise.** Neither port told the model to make exactly one tool call - the fact that this run chose a 2-hop traversal to actually answer BOTH halves of the compound question (where it's held AND what protects it) is a genuine, verifiable difference in agent behavior, not a coincidence to gloss over.
- **Extracting from raw tool output, established as the fix in Day 50's port, generalizes cleanly here too.** The same pattern - `toolResults.flatMap(r => r.output)` instead of the model's paraphrased final text - is what makes it possible to see and verify BOTH tool calls' real results, not just whatever the final answer chose to mention.

## Why This Port Matters in Production

Grounding doesn't just mean "the final answer happens to be correct" - it means every FACT used to construct that answer traces back to a real, verifiable graph relation, including facts assembled across multiple tool calls. This port's 2-hop traversal is a good example of Graph-RAG's grounding chain surviving intact even when the model decides, on its own, to do more work than the simplest version of the question strictly required.

## Density Add-On: Graph Evidence Pack Contract (TS)

Capture graph tool output as typed evidence records.

Recommended fields
- `sourceId`
- `retrievalMethod` (`graph`)
- `relationPath`
- `hopCount`
- `verified`

Why this helps
- Multi-hop grounding becomes measurable.
- You can test whether a second tool call improved coverage.

Practice checkpoint
- Convert raw `toolResults` into `GraphEvidenceRecord[]`.
- Assert `hopCount >= 2` for the known-entity compound question path in this run.
