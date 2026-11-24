Day 31 replaces static, hardcoded few-shot examples with a dynamic semantic selector - and confirms the selection is genuinely working with real measured similarity scores.

---

## Prompt Engineering — Day 31: Dynamic Few-Shot Prompt Calibration

### The Problem We're Solving

Hardcoding a fixed set of few-shot examples into every agent call wastes tokens on irrelevant demonstrations and, worse, can actively degrade output quality when the examples shown don't match the structural style the current task actually needs. A **dynamic few-shot selector** keeps a small repository of golden input/output pairs, embeds them once, and at query time picks only the top-k most semantically similar examples to inject into the prompt - calibrating the demonstration to the specific task, not a one-size-fits-all set.

Focus: real semantic selection verified against actual measured similarity scores, not assumed to work because the demo output looked reasonable
Time investment: 15 minutes

### Step 1: Build the Selector and Run It

`apps/ai-engine/src/optimization/dynamic_prompt_optimizer.py` embeds three golden examples (state management, type safety, hybrid search) and, given a new task about strictly-typed JSON output for a Next.js frontend, selects the single most relevant one.

```python
async def select_top_k(self, query: str, k: int = 2) -> str:
    q_vec = await self._embed(query)
    scored = [(self._cosine(q_vec, ex.embedding), ex) for ex in self.examples]
    scored.sort(key=lambda x: x[0], reverse=True)
    return "\n".join(format_example(ex) for ex in scored[:k])
```

Real run: the selector correctly chose the "Type Safety" example over "State Management" and "Search Retrieval" for a query about typed JSON output - and the calibrated agent's final answer explicitly followed that example's structural style (Pydantic-based validation, matching the demonstrated pattern).

### Step 2: Don't Just Trust the Demo Output - Measure the Real Scores

A single plausible-looking output doesn't prove the SELECTION mechanism is doing real semantic work rather than coincidentally landing on a reasonable answer regardless of which example won. Printed the actual cosine scores directly:

```
0.3295 -- State Management
0.3569 -- Type Safety
0.1655 -- Search Retrieval
```

Real, genuine separation: "Type Safety" scores meaningfully higher than "State Management" (both plausible-sounding categories for a JSON-typing question), and "Search Retrieval" - genuinely unrelated to the query - scores clearly lowest. This confirms the selector picked the right example for the right reason, not by chance.

Unlike Day 28's memory-recall threshold, this selector always returns the top-k regardless of absolute score (no hard cutoff), so there's no threshold-miscalibration bug possible here - the ranking itself is what matters, and the ranking is correct.

---

## Best Practices

- **A single plausible demo output is not proof a semantic-selection mechanism works correctly.** It's consistent with the selector working, but also consistent with the underlying model being good enough to produce a reasonable answer regardless of which example happened to be injected. Printing the real similarity scores is what actually confirms the RIGHT example won for the RIGHT reason.
- **Not every retrieval mechanism needs a threshold, and adding one where it isn't needed is its own risk.** Day 28's memory recall needed a cutoff (to correctly exclude irrelevant facts, not just rank them); this always-return-top-k selector doesn't need one, since it's calibrating STYLE from the best available example rather than deciding whether to include a fact at all. Recognizing which pattern a given retrieval problem actually needs avoids importing a bug (like Day 28's miscalibrated 0.75) into a design that doesn't need a threshold at all.

## Why This Matters in Production

Dynamic few-shot calibration is only valuable if the selection is genuinely semantic - if it were effectively random, injecting a "relevant" example would provide no more value than a static hardcoded one, just with extra embedding-API latency and cost. The measured score separation here (0.3569 vs 0.3295 vs 0.1655) is the actual evidence that the mechanism earns its complexity.
