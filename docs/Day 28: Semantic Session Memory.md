Day 28 gives an agent memory across sessions - and finds a real miscalibration in the initial similarity threshold that silently broke recall entirely, until it was measured and fixed.

---

## Long-Term Memory — Day 28: Semantic Session Memory

### The Problem We're Solving

A stateless chatbot forgets everything the moment the conversation ends. Real enterprise agents need to remember facts across separate sessions - past preferences, past architectural decisions, past tool outcomes - without stuffing weeks of raw chat history into every prompt. A **semantic memory store** converts past facts into vector embeddings once, then at query time retrieves only what's actually relevant via cosine similarity, and lets the agent pull that context in through a tool call rather than a hardcoded prompt injection.

Focus: a real vector-similarity memory store, and a genuine measured finding that the initial threshold was miscalibrated for the embedding model actually being used
Time investment: 15 minutes, plus discovering why recall returned nothing on the very first real run

### Step 1: Build the Store and Run It - It Silently Fails

`apps/ai-engine/src/memory/semantic_memory_store.py` embeds facts with `text-embedding-3-small`, stores them with their session ID, and on `recall()` computes cosine similarity against a query, filtering by the documented threshold of 0.75.

The first real run, exactly as written, silently failed:

```
--- Session 3: New Prompt Querying Past Facts ---
Answer: It looks like I don't have any prior information about the hosting platform or vector database your team uses.
Recalled Facts: []
```

Both stored facts were genuinely relevant to the query - this wasn't a case of the agent correctly finding nothing. Two API-drift fixes were needed first (`result_type` → `output_type`, `result.data` → `result.output`, the same rename this repo has hit before), but fixing those didn't change the empty result - meaning the recall logic itself, not the agent wiring, was the actual problem.

### Step 2: Measure the Real Numbers Instead of Guessing

```python
q_vec = await store._embed(query)
for item in store.records:
    score = store._cosine(q_vec, item.embedding)
    print(f"{score:.4f} -- {item.fact}")
```

Real measured output:

```
0.4502 -- The team uses Pydantic AI with Azure Container Apps for hosting.
0.5513 -- Our target database is Postgres with Qdrant for vector search.
0.1434 -- We never use plain string matching for unit testing LLMs.
```

The initial threshold of 0.75 (and the architecture diagram's stated "Cosine Match >= 0.80") never fires for `text-embedding-3-small` on short factual sentences like these - real similarity for genuinely relevant facts lands around 0.45-0.55, and the genuinely unrelated fact scores 0.14. The gap between "relevant" (0.45-0.55) and "irrelevant" (0.14) is real and usable - the threshold just needed to sit inside that gap, not above both of them.

**Fix**: recalibrated the threshold to 0.35 - a value chosen from the actual measured scores, not guessed. Re-running after the fix correctly recalled both relevant facts and correctly excluded the unrelated one.

```
--- Agent Response ---
Answer: The team uses Pydantic AI with Azure Container Apps for hosting and Postgres with Qdrant for vector search.
Recalled Facts: ['The team uses Pydantic AI with Azure Container Apps for hosting.', 'Our target database is Postgres with Qdrant for vector search.']
```

---

## Best Practices

- **Never trust a similarity threshold from a spec without measuring it against the actual embedding model in use.** "Cosine similarity >= 0.75" sounds authoritative in an architecture diagram, but different embedding models produce genuinely different score distributions for the same kind of text - the only way to know the right threshold is to measure real scores from the model you're actually calling.
- **When a retrieval step returns nothing, print the real scores before assuming the data or the query is wrong.** The facts here were correctly embedded and genuinely relevant - the bug was entirely in an unmeasured threshold, and printing the actual numbers found it in one step.

## Why This Matters in Production

A memory system that silently returns nothing is worse than one that visibly errors - the agent above didn't crash, it just apologized and moved on, which in production would look like "the agent doesn't remember anything" rather than "one threshold constant is wrong." The fix took thirty seconds once the real numbers were printed; finding that a fix was even needed took actually running the code with a genuinely relevant query and noticing the recall came back empty.

## Density Add-On: Memory Write Policy and Safety Evals

Good recall is not enough. Memory writes also need safety rules.

Write policy checks
- block direct contact details (email, phone)
- block secrets (API key, password, private key)
- block full account identifiers in memory text
- allow non-sensitive preference and workflow facts

Safety eval contract
- keep a small fixed set of allow/block test cases
- run them before shipping memory changes
- require 100% pass on policy checks

Practice checkpoint
- run `apps/ai-engine/src/memory/memory_write_policy.py`
- confirm it prints `safety_eval_accuracy=100.00%`
- if a blocked case passes, treat it as a release blocker
