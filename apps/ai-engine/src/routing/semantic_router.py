import asyncio
import math
import time

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()


# What a routed query returns: which model actually handled it, whether it
# came from the cache, how long it took, and the real answer.
class RoutedResponse(BaseModel):
    query: str
    model_used: str
    is_cached: bool
    latency_ms: float
    content: str


# A tiny vector store held entirely in memory: no external database, just a
# list of (text, embedding, cached answer) tuples. This is enough to prove
# the caching IDEA works; a real deployment would swap this for a real
# vector database without changing how the router calls it.
class SemanticCache:
    def __init__(self, similarity_threshold: float = 0.92):
        self.threshold = similarity_threshold
        self.records: list[tuple[str, list[float], str]] = []
        self.openai_client = AsyncOpenAI()

    async def _get_embedding(self, text: str) -> list[float]:
        response = await self.openai_client.embeddings.create(model="text-embedding-3-small", input=text)
        return response.data[0].embedding

    # Cosine similarity measures how close two embeddings point in the
    # same direction, from -1 (opposite) to 1 (identical meaning) - this is
    # the actual math behind "these two questions mean roughly the same
    # thing," even when they don't share a single word in common.
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


# Two agents at two different cost/quality points, plus a cache in front of
# both. A "router" here just means: decide which of several options should
# actually handle this specific request, instead of always using the same
# one regardless of how simple or complex it is.
class MultiModelRouter:
    def __init__(self, cache: SemanticCache):
        self.cache = cache
        self.fast_agent = Agent("openai:gpt-4o-mini", system_prompt="Answer concisely.")
        self.reasoning_agent = Agent(
            "openai:gpt-4o", system_prompt="Provide deep, type-safe architecture advice."
        )

    async def query(self, prompt: str) -> RoutedResponse:
        start_time = time.perf_counter()

        # Step A: a cache hit skips the AI call ENTIRELY - no model, no
        # cost, no meaningful latency. This is only possible because the
        # lookup is by MEANING (cosine similarity), not by an exact string
        # match, so a reworded version of an already-answered question
        # still hits.
        cached_content = await self.cache.lookup(prompt)
        if cached_content:
            latency = (time.perf_counter() - start_time) * 1000
            return RoutedResponse(
                query=prompt,
                model_used="semantic-cache-v1",
                is_cached=True,
                latency_ms=round(latency, 2),
                content=cached_content,
            )

        # Step B: route by complexity. A cheap keyword check is enough here
        # - reaching for another AI call just to decide which AI call to
        # make would defeat the purpose of routing to save cost.
        is_complex = any(
            keyword in prompt.lower() for keyword in ["architecture", "pydantic", "monorepo", "fastmcp"]
        )
        selected_model = "openai:gpt-4o" if is_complex else "openai:gpt-4o-mini"
        selected_agent = self.reasoning_agent if is_complex else self.fast_agent

        print(f"  [ROUTER DISPATCH] Routing query to: {selected_model}")
        result = await selected_agent.run(prompt)
        content_text = str(result.output)

        # Step C: store this exchange so a FUTURE, differently-worded
        # version of the same question can hit the cache next time.
        await self.cache.store(prompt, content_text)

        latency = (time.perf_counter() - start_time) * 1000
        return RoutedResponse(
            query=prompt,
            model_used=selected_model,
            is_cached=False,
            latency_ms=round(latency, 2),
            content=content_text,
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
