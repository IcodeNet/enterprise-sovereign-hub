"""Long-term semantic memory store - Day 28.

Converts past facts into vector embeddings and lets the agent recall only
what's relevant to a new query via cosine similarity, instead of stuffing
every prior session's raw history into the prompt window.
"""

import asyncio
import math

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

load_dotenv()


class MemoryItem(BaseModel):
    session_id: str
    fact: str
    embedding: list[float]


class AgentMemoryResponse(BaseModel):
    answer: str
    recalled_facts: list[str] = Field(description="List of past memories used in the answer.")


class SemanticMemoryStore:
    # 0.75 (the PDF's original threshold) never actually fires for
    # text-embedding-3-small - real cosine scores for genuinely relevant
    # short facts land around 0.45-0.55 in practice (measured directly:
    # see the Day 28 doc for the real numbers). 0.35 is calibrated against
    # that measurement, not guessed.
    def __init__(self, similarity_threshold: float = 0.35):
        self.records: list[MemoryItem] = []
        self.threshold = similarity_threshold
        self.client = AsyncOpenAI()

    async def _embed(self, text: str) -> list[float]:
        res = await self.client.embeddings.create(model="text-embedding-3-small", input=text)
        return res.data[0].embedding

    @staticmethod
    def _cosine(v1: list[float], v2: list[float]) -> float:
        dot = sum(a * b for a, b in zip(v1, v2, strict=True))
        norm_a = math.sqrt(sum(a * a for a in v1))
        norm_b = math.sqrt(sum(b * b for b in v2))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    async def save_fact(self, session_id: str, fact: str) -> None:
        vector = await self._embed(fact)
        self.records.append(MemoryItem(session_id=session_id, fact=fact, embedding=vector))
        print(f" [MEMORY STORED] '{fact}' (Session: {session_id})")

    async def recall(self, query: str, limit: int = 3) -> list[str]:
        if not self.records:
            return []

        q_vector = await self._embed(query)
        scored = [(self._cosine(q_vector, item.embedding), item.fact) for item in self.records]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [fact for score, fact in scored if score >= self.threshold][:limit]


class AgentContext:
    def __init__(self, memory_store: SemanticMemoryStore):
        self.store = memory_store


memory_agent = Agent(
    "openai:gpt-4o",
    deps_type=AgentContext,
    output_type=AgentMemoryResponse,
    system_prompt=(
        "We are an enterprise AI assistant with long-term memory. "
        "Use the recall_memory tool to look up past preferences and context before answering."
    ),
)


@memory_agent.tool
async def recall_memory(ctx: RunContext[AgentContext], search_topic: str) -> list[str]:
    """Recalls relevant long-term memories from previous sessions."""
    return await ctx.deps.store.recall(search_topic)


async def run_memory_demo() -> None:
    store = SemanticMemoryStore()
    deps = AgentContext(memory_store=store)

    print("--- Session 1: Storing Past Facts ---")
    await store.save_fact("session_001", "The team uses Pydantic AI with Azure Container Apps for hosting.")
    await store.save_fact("session_001", "Our target database is Postgres with Qdrant for vector search.")
    await store.save_fact("session_002", "We never use plain string matching for unit testing LLMs.")

    print("\n--- Session 3: New Prompt Querying Past Facts ---")
    new_query = "What hosting platform and vector database does our team use?"

    result = await memory_agent.run(new_query, deps=deps)
    data: AgentMemoryResponse = result.output

    print("\n--- Agent Response ---")
    print(f"Answer: {data.answer}")
    print(f"Recalled Facts: {data.recalled_facts}")


if __name__ == "__main__":
    asyncio.run(run_memory_demo())
