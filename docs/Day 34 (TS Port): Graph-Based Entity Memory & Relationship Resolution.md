Day 34's TypeScript port builds the same entity-graph memory using `graphology` (already installed for Day 21's knowledge-graph work), and finds a real, structured-output-specific bug that the Python side never hits.

---

## Agent Memory — Day 34 (TS Port): Graph-Based Entity Memory & Relationship Resolution

### The Problem We're Solving

Same problem as the Python lesson: flat memory storage can't connect related facts mentioned across separate sessions about the same entity. A graph structure - entities as nodes, relationships as edges, repeated mentions reinforcing existing nodes/edges - fixes this on the TypeScript side too.

Focus: the same entity-graph merge logic, built with `graphology` and the Vercel AI SDK's `generateObject`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the graph store (`networkx.DiGraph`) | the graph store (`new Graph({ type: "directed" })` from `graphology`) |
| the expected extraction shape (`class EntityExtractionPayload(BaseModel)`) | the expected extraction shape (`const EntityExtractionSchema = z.object({...})`) |
| asking the AI to extract entities (`await graph_memory_agent.run(new_information)`) | asking the AI to extract entities (`await generateObject({ model, schema, prompt })`) |
| checking if a node exists (`self.graph.has_node(canonical_node)`) | checking if a node exists (`this.graph.hasNode(canonicalNode)`) |
| reading an edge's accumulated weight (`self.graph[src][tgt]["weight"]`) | reading an edge's accumulated weight (`this.graph.getEdgeAttribute(edge, "weight")`) |

### Step 1: Build the Graph Store with `graphology`

```typescript
class DynamicEntityGraph {
  private graph = new Graph({ type: "directed" });

  updateGraph(payload: EntityExtractionPayload): void {
    for (const node of payload.entities) {
      const canonicalNode = toCanonical(node);
      if (!this.graph.hasNode(canonicalNode)) {
        this.graph.addNode(canonicalNode, { mentions: 1 });
      } else {
        this.graph.setNodeAttribute(canonicalNode, "mentions", ...current + 1);
      }
    }
    // ... edges accumulate weight the same way as the Python side
  }
}
```

### Step 2: A Real Bug the Python Side Never Hits - OpenAI's Structured Output Requires Every Field in `required`

First run failed immediately:

```
APICallError: Invalid schema for response_format 'response': In context=('properties', 'relations', 'items'), 'required' is required to be supplied and to be an array including every key in properties. Missing 'confidence'.
```

Root cause: the schema used `z.number().default(1.0)` for `confidence`. Zod's `.default()` makes a field OPTIONAL in the generated JSON Schema (since a default means the caller doesn't have to supply it) - but OpenAI's structured-output mode (via the Responses API's `response_format`) requires every property to be listed in the schema's `required` array with no exceptions. Pydantic AI's Python-side schema generation doesn't hit this because it handles Python default values differently when building the tool schema sent to the model.

**Fix**: drop the `.default()` and just describe the expected default behavior in the field's own description instead of encoding it as a schema-level default:

```typescript
confidence: z.number().describe("Confidence weight between 0.0 and 1.0, default 1.0 if unstated."),
```

Re-run after the fix:

```
Processing Statement: "Byron leads AI Engineering architecture at a fintech company and designs sovereign agent frameworks."
Extracted Entities: ["Byron","AI Engineering","fintech company","sovereign agent frameworks"]
 -> Link: (Byron) -[leads]-> (AI Engineering)
 -> Link: (Byron) -[works at]-> (fintech company)
 -> Link: (Byron) -[designs]-> (sovereign agent frameworks)

=== Graph Memory Query for 'Byron' ===
 (Byron) -[leads]-> (Ai Engineering) [weight: 1.0]
 (Byron) -[works at]-> (Fintech Company) [weight: 1.0]
 (Byron) -[designs]-> (Sovereign Agent Frameworks) [weight: 1.0]
```

Real, correct output, matching the Python side's resolved relationships. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **A schema library's convenience feature (a default value) can silently produce an invalid schema for a specific provider's strict mode, even when the schema is perfectly valid TypeScript/Zod.** OpenAI's structured-output mode is stricter than the JSON Schema spec itself allows (it demands 100% of properties in `required`, treating "has a default" and "is required" as unrelated concepts) - always test a schema against the actual live API call before assuming a convenience feature like `.default()` will just work.
- **The same underlying data model can hit provider-specific validation quirks in one language's SDK and not the other's**, even when both ultimately call the same model - Pydantic AI's own schema-generation layer absorbed this difference for Python; the Vercel AI SDK's more literal Zod-to-JSON-Schema translation did not.

## Why This Port Matters in Production

A structured-output schema that looks correct and compiles cleanly can still be rejected at the API boundary for reasons that have nothing to do with the code's own logic - provider-specific strict-mode requirements are a real, distinct failure class from a typical validation bug, and catching them requires an actual live API call, not just a type-checker pass.
