Day 31's TypeScript port reproduces the same dynamic few-shot selection independently, using the language's own vector-math primitives, and confirms the same example wins for the same measured reason.

---

## Prompt Engineering — Day 31 (TS Port): Dynamic Few-Shot Prompt Calibration

### The Problem We're Solving

Hardcoding a fixed set of few-shot examples into every agent call wastes tokens on irrelevant demonstrations and can actively degrade output quality when the examples shown don't match the structural style the current task actually needs. A **dynamic few-shot selector** keeps a small repository of golden input/output pairs, embeds them once, and at query time picks only the top-k most semantically similar examples to inject into the prompt.

Focus: reproducing the Python side's semantic-selection result independently, using the Vercel AI SDK's own vector-math exports
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the selector (`apps/ai-engine/src/optimization/dynamic_prompt_optimizer.py`) | the selector (`apps/web/src/optimization/dynamic-prompt-optimizer.ts`) |
| embedding the query (`await self._embed(query)`) | embedding the query (the Vercel AI SDK's `embed()`) |
| scoring each golden example (`self._cosine(q_vec, ex.embedding)`, computed by hand) | scoring each golden example (the SDK's own `cosineSimilarity()` export) |
| picking the best examples (`select_top_k(query, k=2)` with `scored.sort(key=lambda x: x[0], reverse=True)`) | picking the best example (the same ranking, selecting "Type Safety") |

### Step 1: Build the Selector Using the SDK's Own Vector-Math Exports

`apps/web/src/optimization/dynamic-prompt-optimizer.ts` uses the Vercel AI SDK's own `embed()`/`cosineSimilarity()` exports (the same real ecosystem advantage already used on Day 28's TS port) instead of hand-rolling the vector math.

### Step 2: Run the Identical Query

Running the identical query through the TS port selected the same "Type Safety" example as the Python side, and the calibrated agent's answer followed the same demonstrated structural style.

`tsc --noEmit` and `oxlint` both clean, `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **Reuse a language ecosystem's own vector-math primitives** (`embed`/`cosineSimilarity` here, same as Day 28) rather than hand-rolling them separately in every module that needs cosine similarity - one less place for a transcription bug to hide.
- **The same example winning in two independent implementations, built on two different SDKs, is stronger evidence the selection is genuinely semantic** than trusting either language's result alone.

## Why This Matters in Production

Dynamic few-shot calibration is only valuable if the selection is genuinely semantic, not an artifact of one implementation's specific math. Getting the same result independently in a second language, via a completely different embedding call path, is real confirmation that the underlying similarity signal - not a coincidence in one codebase - is what's driving the correct selection.
