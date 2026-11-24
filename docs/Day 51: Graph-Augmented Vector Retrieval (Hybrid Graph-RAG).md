Day 51 grounds an agent's answer in verified knowledge-graph triples instead of vector similarity alone, and directly cross-checks the model's claimed answer against the graph's own real relations rather than trusting it.

---

## Retrieval & Search — Day 51: Graph-Augmented Vector Retrieval (Hybrid Graph-RAG)

### The Problem We're Solving

Vector search alone can return context that's semantically SIMILAR but factually DISCONNECTED - a chunk about "Partner Bank C" might rank highly for a query about a specific account, without actually saying anything true about that account. Graph-RAG (Graph-augmented Retrieval-Augmented Generation) fixes this by combining vector embeddings with knowledge graph triples - `(Subject) -[Predicate]-> (Object)` facts, like `(ACC-4081) -[HELD_AT]-> (Partner Bank C)` - so the agent's answer is grounded in a VERIFIED relationship, not just similarity.

Focus: querying a real triple store as a tool, with a direct cross-check that the agent's claim matches a real graph relation
Time investment: 15 minutes

### Step 1: Build the Knowledge Graph Store

`apps/ai-engine/src/retrieval/graph_rag_retriever.py`'s `KnowledgeGraphStore` holds a small set of subject-predicate-object triples, with `find_relations()` returning every triple touching a given entity, in either direction:

```python
def find_relations(self, entity_id: str) -> List[str]:
    return [
        f"({t['subject']}) -[{t['predicate']}]-> ({t['object']})"
        for t in self.triples
        if t["subject"].lower() == entity_id.lower() or t["object"].lower() == entity_id.lower()
    ]
```

### Step 2: Verify the Answer Is Genuinely Grounded, Not Just Plausible

The source's own demo prints the agent's final answer and stops - it never actually checks the claimed holding institution against the graph's own real relations. Added a direct cross-check: call `find_relations()` independently and confirm the agent's claimed answer genuinely appears in that real list.

### Step 3: Run and Verify Both Scenarios - Real Results

```
=== Final Grounded Resolution ===
Holding Institution: Partner Bank C
Verified Relationship: HELD_AT
Confidence Score: 100.0%

[VERIFIED] Agent's claimed holding institution ('Partner Bank C') matches a real graph relation:
['(ACC-4081) -[HELD_AT]-> (Partner Bank C)', '(ACC-4081) -[CURRENCY]-> (GBP)']

--- Test 2: Genuinely Unknown Entity (No Graph Relations Exist) ---
[VERIFICATION] Real graph relations for ACC-0000: [] (expected: empty list)
[VERIFIED] The knowledge graph correctly has zero relations for this untracked account - any agent answer claiming otherwise would be a hallucination.
```

Test 1 confirms the agent's answer is genuinely grounded - it matches a real triple, not a plausible-sounding fabrication. Test 2, added beyond the source's demo, confirms the graph itself correctly has ZERO relations for a made-up account ID - the honest baseline any future hallucination-detection check would need to compare against.

---


*(Sample names in this lesson's data, a bank name and an account id, were later replaced with generic ones; the outputs above show the new names in place of the originals.)*

## Best Practices

- **Cross-check the agent's claimed answer against the SAME data source it was supposed to use, independently.** Printing a confident-sounding final answer proves nothing on its own - calling `find_relations()` a second time, outside the agent's own tool call, is what actually proves the claim is grounded rather than merely plausible.
- **Test the "nothing is known" case explicitly, not just the "something is known and correctly resolved" case.** A hallucination risk specifically shows up on entities the graph has never heard of - proving the graph itself correctly returns nothing for those is the necessary baseline before ever testing whether the AGENT correctly refuses to fabricate an answer for them.

## Why This Matters in Production

Graph-RAG's whole value proposition is that its answers are grounded in verifiable facts, not vector similarity guesses - so the verification for a Graph-RAG lesson has to actually verify the grounding, not just admire a confident-sounding final answer. This is the same discipline as Day 41's schema-evolution evaluator and Day 44's guardrail tests: a system built to prevent a specific failure mode needs a test that could actually catch that failure mode if it occurred.

## Density Add-On: Graph Evidence Pack

For graph-grounded answers, store the relation path as evidence, not only the final sentence.

Recommended fields
- `source_id` (entity queried)
- `retrieval_method` (`graph`)
- `relation_path` (one-hop or multi-hop)
- `confidence_score`
- `verified` (true/false after cross-check)

Why this helps
- You can prove each claim with explicit triples.
- You can separate graph coverage issues from model wording issues.

Practice checkpoint
- For known entity and unknown entity tests, emit one evidence pack each.
- Confirm unknown entity emits an empty relation path with `verified=true`.
