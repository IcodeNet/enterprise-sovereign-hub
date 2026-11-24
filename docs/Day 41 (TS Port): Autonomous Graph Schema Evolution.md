Day 41's TypeScript port reproduces the identical structural finding (schema evolution never triggers because the extractor is shown the known predicates), and finds a second, genuine cross-run difference: the evaluator's rejection logic didn't fire the same way it did on the Python side for the identical redundant-predicate test.

---

## Retrieval & Knowledge Graphs — Day 41 (TS Port): Autonomous Graph Schema Evolution

### The Problem We're Solving

Same problem as the Python lesson: a fixed ontology needs a way to genuinely evolve when a new relationship type is found, without corrupting existing graph data using the old schema.

Focus: the same extractor-then-evaluator pipeline, built with `generateObject`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the extracted triplet shape (`class ProposedRelation(BaseModel)`) | the extracted triplet shape (`const ProposedRelationSchema = z.object({...})`) |
| the evolution decision shape (`class SchemaEvolutionProposal(BaseModel)`) | the evolution decision shape (`const SchemaEvolutionProposalSchema = z.object({...})`) |
| the live registry (`registry.allowed_predicates: Set[str]`) | the live registry (`registry.allowedPredicates: Set<string>`) |
| extracting a candidate (`await extractor_agent.run(...)`) | extracting a candidate (`await generateObject({ model, schema, prompt })` in `extractTriplet`) |
| running the evaluator (`await schema_evaluator_agent.run(eval_prompt)`) | running the evaluator (`await generateObject({ model, schema, prompt })` in `evaluateSchemaEvolution`) |

### Step 1: Build the Pipeline

Structurally identical to the Python side - same bias-inducing pattern of showing the extractor the known predicate list before asking it to extract.

### Step 2: Same Structural Finding, Confirmed Independently

```
"The security fuzzer dynamically penetrates the target API boundary." -> DEPENDS_ON (accepted)
"The web app relies on the AI engine service to function."             -> DEPENDS_ON (accepted)
```

Same real result as Python: schema evolution never triggered, for the same root cause (the extractor is shown the known predicates before extracting, biasing it to reuse one). `tsc --noEmit` clean after fixing one lint issue (`.sort()` → `.toSorted()`), `oxlint` clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

### Step 3: A Second, Genuine Cross-Run Difference in the Evaluator's Own Logic

Directly testing the evaluator (since the pipeline never naturally reached it, same as Python):

```
Genuinely novel predicate (CRYPTOGRAPHICALLY_SIGNS): Approved: true - matches Python's result.

Genuinely redundant predicate (RUNS_INSIDE vs existing HOSTED_ON): Approved: true, Reason: null
```

**This does NOT match the Python side**, which correctly rejected `RUNS_INSIDE` as redundant with `HOSTED_ON` in the identical test. This run's `gpt-4o` call approved it instead - a genuine, real inconsistency in the underlying model's own judgment on the exact same redundancy question, not a code bug in either language's implementation. Both languages send the model the identical known-predicates list and the identical proposed predicate; the model's own verdict differed between the two independent calls.

---

## Best Practices

- **A "the model got this right" result from one call doesn't guarantee it gets the identical question right on a different call, even with an identical prompt.** The Python side's redundancy rejection and the TS side's redundancy approval are both real, both plausible-sounding, and directly contradict each other on the exact same question - report both rather than picking the one that looks better.
- **When verifying a branch of logic directly (since the live pipeline doesn't naturally reach it), run it more than once, in more than one context, before drawing a conclusion about how reliable that logic actually is.** A single verification run in each language gave two different answers to the identical redundancy question - a single run in either language alone would have looked confidently correct.

## Why This Port Matters in Production

Porting the same pipeline to a second language and independently re-running the SAME direct verification test surfaced a second real finding beyond the shared structural bug: the underlying model's own redundancy judgment isn't perfectly consistent even on an identical, well-specified question. For a production ontology-evolution gate, this argues for either multiple judge calls with a majority vote, or a stricter, more deterministic redundancy check (e.g. embedding similarity against existing predicate descriptions) rather than trusting a single LLM call's verdict on whether a new predicate is "redundant."
