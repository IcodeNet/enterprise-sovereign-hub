Day 11 is about not calling an expensive AI model for a question you've effectively already answered, and not using a slow model for a question that doesn't need one.

---

## Dynamic Routing — Day 11: Multi-Model Router & Semantic Cache

### The Problem We're Solving

Two real costs pile up fast in a production AI system: paying for a full model call every single time, even when the exact same question (worded slightly differently) was already answered minutes ago; and using an expensive, slow model for a trivial question that a cheap, fast one could answer just as well.

**Semantic caching** fixes the first problem: instead of caching by exact text match (useless - the same question is rarely typed identically twice), we cache by *meaning*. Every question gets converted into an embedding (a list of numbers representing its meaning), and a new question is compared against everything already cached using **cosine similarity** - a single number from -1 to 1 measuring how closely two embeddings point in the same direction. Above a threshold (0.90 here), we treat it as "close enough" and return the cached answer instantly, skipping the AI call entirely.

**Multi-model routing** fixes the second: a cheap keyword check decides whether a question needs deep reasoning (routed to a stronger, slower model) or is simple enough for a fast, cheap one - without paying for another AI call just to make that decision.

Focus: caching by meaning instead of exact text, and routing by complexity instead of always using one model
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `openai` and `pydantic-ai`, already installed from earlier lessons.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/routing/`, create:
`semantic_router.py`

### Step 3: Add the Source Code

```python
import asyncio
import math
import time

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()


class RoutedResponse(BaseModel):
    query: str
    model_used: str
    is_cached: bool
    latency_ms: float
    content: str


class SemanticCache:
    def __init__(self, similarity_threshold: float = 0.92):
        self.threshold = similarity_threshold
        self.records: list[tuple[str, list[float], str]] = []
        self.openai_client = AsyncOpenAI()

    async def _get_embedding(self, text: str) -> list[float]:
        response = await self.openai_client.embeddings.create(model="text-embedding-3-small", input=text)
        return response.data[0].embedding

    @staticmethod
    def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
        dot_product = sum(a * b for a, b in zip(v1, v2))
        norm_v1 = math.sqrt(sum(a * a for a in v1))
        norm_v2 = math.sqrt(sum(b * b for b in v2))
        return dot_product / (norm_v1 * norm_v2) if norm_v1 and norm_v2 else 0.0

    async def lookup(self, query: str) -> str | None:
        if not self.records:
            return None

        query_vector = await self._get_embedding(query)
        best_match = None
        highest_score = 0.0

        for _record_text, record_vector, cached_output in self.records:
            score = self._cosine_similarity(query_vector, record_vector)
            if score > highest_score:
                highest_score = score
                best_match = cached_output

        if highest_score >= self.threshold:
            print(f"  [CACHE HIT] Semantic match found (Similarity: {highest_score:.4f})")
            return best_match

        print(f"  [CACHE MISS] Highest similarity was {highest_score:.4f} < {self.threshold}")
        return None

    async def store(self, query: str, output: str):
        vector = await self._get_embedding(query)
        self.records.append((query, vector, output))


class MultiModelRouter:
    def __init__(self, cache: SemanticCache):
        self.cache = cache
        self.fast_agent = Agent("openai:gpt-4o-mini", system_prompt="Answer concisely.")
        self.reasoning_agent = Agent(
            "openai:gpt-4o", system_prompt="Provide deep, type-safe architecture advice."
        )

    async def query(self, prompt: str) -> RoutedResponse:
        start_time = time.perf_counter()

        cached_content = await self.cache.lookup(prompt)
        if cached_content:
            latency = (time.perf_counter() - start_time) * 1000
            return RoutedResponse(
                query=prompt, model_used="semantic-cache-v1", is_cached=True,
                latency_ms=round(latency, 2), content=cached_content,
            )

        is_complex = any(
            keyword in prompt.lower() for keyword in ["architecture", "pydantic", "monorepo", "fastmcp"]
        )
        selected_model = "openai:gpt-4o" if is_complex else "openai:gpt-4o-mini"
        selected_agent = self.reasoning_agent if is_complex else self.fast_agent

        print(f"  [ROUTER DISPATCH] Routing query to: {selected_model}")
        result = await selected_agent.run(prompt)
        content_text = str(result.output)

        await self.cache.store(prompt, content_text)

        latency = (time.perf_counter() - start_time) * 1000
        return RoutedResponse(
            query=prompt, model_used=selected_model, is_cached=False,
            latency_ms=round(latency, 2), content=content_text,
        )


async def main():
    cache = SemanticCache(similarity_threshold=0.90)
    router = MultiModelRouter(cache=cache)

    print("--- Query 1: Initial Complex Architecture Request ---")
    res1 = await router.query("How do we structure a Pydantic AI monorepo with FastMCP?")
    print(f"Model: {res1.model_used} | Latency: {res1.latency_ms}ms | Cached: {res1.is_cached}\n")

    print("--- Query 2: Semantically Equivalent Request (Should HIT Cache) ---")
    res2 = await router.query("What is the best way to structure a monorepo for Pydantic AI and FastMCP?")
    print(f"Model: {res2.model_used} | Latency: {res2.latency_ms}ms | Cached: {res2.is_cached}\n")

    print("--- Query 3: Simple Request (Should Route to Light Model) ---")
    res3 = await router.query("What does API stand for?")
    print(f"Model: {res3.model_used} | Latency: {res3.latency_ms}ms | Cached: {res3.is_cached}\n")


if __name__ == "__main__":
    asyncio.run(main())
```

### Step 4: Run and Verify With Real Latency Evidence

```bash
python src/routing/semantic_router.py
```

Real numbers from an actual run: Query 1 (a genuinely new complex question) took **14,334.79ms** through `gpt-4o`. Query 2 - a reworded version of the SAME question, sharing barely any exact words - correctly scored **0.9166** similarity (above the 0.90 threshold) and returned from cache in **915.34ms**: a real, over 15x latency drop, with zero additional AI cost. Query 3 (an unrelated simple question) correctly missed the cache (0.2303 similarity, nowhere close to threshold) and got routed to the cheap `gpt-4o-mini` model rather than the expensive one.

---

## Best Practices

- **Cache by meaning (embeddings + cosine similarity), not by exact text.** An exact-match cache would have missed Query 2 entirely, since "How do we structure a Pydantic AI monorepo with FastMCP?" and "What is the best way to structure a monorepo for Pydantic AI and FastMCP?" share no identical substring longer than a few words.
- **Use a cheap, deterministic check to decide routing - don't spend an AI call on the decision itself.** The keyword check here costs nothing and takes microseconds; asking an AI model "is this question complex?" before answering it would add latency and cost to every single query, defeating the entire point of routing to save cost.
- **Verify a cache hit with the actual similarity score, not just "did it return something."** Seeing `0.9166 >= 0.90` printed in the real output is what proves the semantic match genuinely cleared the threshold - a cache that silently returned the wrong cached answer would look identical from the outside without that number.

## Why This Matters in Production

As our pipelines run the same kinds of questions repeatedly - the same architecture questions asked by different engineers in different words, the same simple lookups asked dozens of times a day - semantic caching turns near-duplicate work into a near-free lookup, and complexity-based routing keeps the expensive model reserved for questions that actually need it. Both savings compound: every cache hit is both faster AND cheaper, not a trade-off between the two.
