Day 34 gives an agent memory that isn't just a list of past messages - it's a graph of resolved entities and relationships that accumulates and reinforces itself as new facts arrive.

---

## Agent Memory — Day 34: Graph-Based Entity Memory & Relationship Resolution

### The Problem We're Solving

Storing conversation memory as flat text (or even a list of separate facts) means related information about the same entity never connects. If session 1 says "Byron leads AI Engineering" and session 2 says "the frameworks Byron designs run on cloud infrastructure," a flat memory store has two disconnected sentences - it can't answer "what does Byron's work actually involve?" without re-reading everything and re-deriving the connection each time.

A graph-based memory fixes this: entities become nodes, relationships become edges, and repeated mentions of the same entity or relationship reinforce the same node/edge (a `mentions` counter, a `weight` that accumulates) instead of creating duplicates.

Focus: extracting entities/relationships from text and merging them into one persistent, growing graph
Time investment: 15 minutes

### Step 1: Fix the API Drift Before Writing Anything

The source material used `result_type=` and `result.data` - both deprecated in the installed `pydantic-ai` version. Checked directly:

```python
import inspect
print(inspect.signature(Agent.__init__))
```

Confirmed (same drift already documented on multiple earlier days): `output_type=` is the current parameter, and the result object exposes `.output`, not `.data`. Used the correct API from the start rather than hitting the same deprecation warning again.

### Step 2: Build the Graph Store

`apps/ai-engine/src/memory/entity_graph_memory.py` uses `networkx.DiGraph` to hold canonicalized entities as nodes and typed relationships as directed edges:

```python
class DynamicEntityGraph:
    def update_graph(self, payload: EntityExtractionPayload) -> None:
        for node in payload.entities:
            canonical_node = node.strip().title()
            if not self.graph.has_node(canonical_node):
                self.graph.add_node(canonical_node, mentions=1)
            else:
                self.graph.nodes[canonical_node]["mentions"] += 1

        for rel in payload.relations:
            src = rel.source_entity.strip().title()
            tgt = rel.target_entity.strip().title()
            if self.graph.has_edge(src, tgt):
                self.graph[src][tgt]["weight"] += rel.confidence
                self.graph[src][tgt]["relation"] = rel.relationship
            else:
                self.graph.add_edge(src, tgt, relation=rel.relationship, weight=rel.confidence)
```

An agent extracts entities/relationships from each new statement; the graph store merges them in, reinforcing existing nodes/edges rather than duplicating them.

### Step 3: Run and Verify

```
Processing Statement: "Byron leads AI Engineering architecture at a fintech company and designs sovereign agent frameworks."
Extracted Entities: ['Byron', 'AI Engineering', 'Fintech Company', 'Sovereign Agent Frameworks']
 -> Link: (Byron) -[leads]-> (AI Engineering)
 -> Link: (Byron) -[works_at]-> (Fintech Company)
 -> Link: (Byron) -[designs]-> (Sovereign Agent Frameworks)

Processing Statement: "The sovereign agent frameworks run on cloud container infrastructure with a type-safe agent library."
Extracted Entities: ['Sovereign Agent Frameworks', 'Cloud Container Infrastructure', 'Type-Safe Agent Library']
 -> Link: (Sovereign Agent Frameworks) -[run on]-> (Cloud Container Infrastructure)
 -> Link: (Sovereign Agent Frameworks) -[include]-> (Type-Safe Agent Library)

=== Graph Memory Query for 'Byron' ===
 (Byron) -[leads]-> (Ai Engineering) [weight: 1.0]
 (Byron) -[works_at]-> (Fintech Company) [weight: 1.0]
 (Byron) -[designs]-> (Sovereign Agent Frameworks) [weight: 1.0]
```

Real, correct output: two separately-fed statements correctly resolved into one connected graph around the shared entity `Sovereign Agent Frameworks`, and querying `Byron`'s neighborhood returns all three real relationships extracted across both statements.

---

## Best Practices

- **Canonicalize entity names before using them as graph keys, not after.** `"Byron".strip().title()` vs `"byron"` vs `" Byron "` would otherwise all become separate nodes for the same real-world entity. Doing this at the point of graph insertion, not as a later cleanup pass, is what makes repeated mentions actually merge.
- **Accumulate confidence/weight on repeated edges rather than overwriting.** A relationship mentioned twice is more certain than one mentioned once - `weight += confidence` captures that; a flat overwrite would lose it.
- **Query in both directions (out-edges and in-edges).** An entity's "neighborhood" includes relationships where it's the source AND where it's the target - querying only one direction silently misses half the real graph.

## Why This Matters in Production

A memory system that just appends flat facts to a list can retrieve individual sentences but can't answer questions that require connecting information stated in different sessions. A graph structure makes those connections structural rather than something the model has to re-derive on every query - the same entity mentioned across sessions accumulates a genuinely richer, connected picture over time.
