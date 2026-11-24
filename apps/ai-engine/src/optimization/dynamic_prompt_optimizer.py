"""Dynamic few-shot prompt calibration - Day 31.

Instead of hardcoding static few-shot examples into an agent's system
prompt (token overhead, and irrelevant examples actively hurt reasoning),
this keeps a small repository of golden input/output pairs and injects only
the top-k most semantically similar ones for the specific task at hand.
"""

import asyncio
import math

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class OptimizedArchitectureSolution(BaseModel):
    task_name: str = Field(description="Name of the solved engineering requirement.")
    pattern_used: str = Field(description="Architecture pattern applied.")
    implementation_summary: str = Field(description="Clean, type-safe explanation.")


class FewShotExample(BaseModel):
    task_category: str
    sample_input: str
    sample_output: str
    embedding: list[float] = []


class DynamicExampleSelector:
    def __init__(self):
        self.examples: list[FewShotExample] = []
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

    async def add_example(self, category: str, input_text: str, output_text: str) -> None:
        vec = await self._embed(input_text)
        self.examples.append(
            FewShotExample(task_category=category, sample_input=input_text, sample_output=output_text, embedding=vec)
        )

    async def select_top_k(self, query: str, k: int = 2) -> str:
        if not self.examples:
            return "No few-shot demonstrations available."

        q_vec = await self._embed(query)
        scored = [(self._cosine(q_vec, ex.embedding), ex) for ex in self.examples]
        scored.sort(key=lambda x: x[0], reverse=True)
        top_examples = [ex for _, ex in scored[:k]]

        formatted = [
            f"--- Demonstration {idx + 1} ({ex.task_category}) ---\nInput: {ex.sample_input}\nOutput: {ex.sample_output}"
            for idx, ex in enumerate(top_examples)
        ]
        return "\n".join(formatted)


calibrated_agent = Agent(
    "openai:gpt-4o",
    output_type=OptimizedArchitectureSolution,
    system_prompt=(
        "We are a principal AI software architect. "
        "Analyze the task carefully and match the structural style demonstrated in the provided few-shot examples."
    ),
)


async def run_calibrated_pipeline(user_prompt: str) -> OptimizedArchitectureSolution:
    selector = DynamicExampleSelector()

    print("Step 1: Populating golden few-shot example store...")
    await selector.add_example(
        category="State Management",
        input_text="How do we manage state across long-running async agents?",
        output_text="Use LangGraph or DBOS durable execution with state checkpointing to Postgres.",
    )
    await selector.add_example(
        category="Type Safety",
        input_text="How do we ensure LLM outputs match strict TypeScript schemas?",
        output_text="Use Pydantic AI with response_model enforcement or Vercel AI SDK generateObject.",
    )
    await selector.add_example(
        category="Search Retrieval",
        input_text="How do we retrieve both exact IDs and semantic context?",
        output_text="Use Qdrant hybrid search combining BM25 sparse vectors and dense OpenAI embeddings via RRF.",
    )

    print(f"\nStep 2: Dynamically retrieving top matching demonstrations for: '{user_prompt}'...")
    relevant_examples = await selector.select_top_k(user_prompt, k=1)
    print(f"Selected Demonstration:\n{relevant_examples}")

    print("Step 3: Running calibrated agent execution...")
    full_prompt = f"{relevant_examples}\n\nTask to solve:\n{user_prompt}"
    result = await calibrated_agent.run(full_prompt)
    return result.output


if __name__ == "__main__":
    task = "We need our Python agent service to output strictly typed JSON for our Next.js frontend."
    solution = asyncio.run(run_calibrated_pipeline(task))

    print("\n=== Optimized Agent Output ===")
    print(f"Task: {solution.task_name}")
    print(f"Pattern: {solution.pattern_used}")
    print(f"Implementation: {solution.implementation_summary}")
