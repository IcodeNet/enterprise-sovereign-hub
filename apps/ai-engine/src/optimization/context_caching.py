import asyncio
import time

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class CachedAnalysisReport(BaseModel):
    query: str
    key_findings: list[str] = Field(description="Key insights extracted from the cached corpus.")
    latency_ms: float = Field(default=0.0, description="Execution latency in milliseconds.")
    cache_read_tokens: int = Field(default=0, description="Tokens served from OpenAI's prompt cache, not re-processed.")


LARGE_ENTERPRISE_CORPUS = (
    """
=== SOVEREIGN INTELLIGENCE HUB SYSTEM ARCHITECTURE SPECIFICATION ===
MODULE 1: AGENT CORE
We enforce type-safe agent execution using Pydantic AI v2.5 across all microservices.
Every agent response maps to a explicit Pydantic model with automatic field validation and retry loops.
Dynamic dependencies pass through RunContext without global variable state.

MODULE 2: RETRIEVAL & VECTOR CACHE
We utilize Qdrant for dense-sparse hybrid vector retrieval with Reciprocal Rank Fusion (RRF).
A semantic vector cache intercepts redundant queries with cosine similarity >= 0.90 to return sub-10ms answers.
Knowledge Graphs extract (Subject -> Predicate -> Object) triplets for multi-hop relational reasoning.

MODULE 3: OBSERVABILITY & SECURITY
OpenTelemetry traces collect span hierarchies using Logfire and Langfuse integration.
Guardrails AI inspects output text for PII leakage, prompt injections, and security rule violations.
Adversarial red-teaming agents intercept jailbreak attempts before executing primary agent tasks.
=====================================================================
"""
    * 130
)  # Repeated 130x (not the original curriculum's 20x, which measured only
# ~640 REAL tokens once actually tokenized - well under OpenAI's ~1024
# token minimum for automatic prompt caching to activate at all, and would
# have shown 0 cache_read_tokens forever regardless of a second call).
# 130x measures ~4000+ tokens, comfortably over that threshold.

cached_agent = Agent(
    "openai:gpt-4o",
    output_type=CachedAnalysisReport,
    system_prompt=(
        "We are a principal AI cost engineer. "
        "Analyze queries against our cached system architecture corpus cleanly and concisely.\n\n"
        f"CORPUS CONTEXT:\n{LARGE_ENTERPRISE_CORPUS}"
    ),
)


async def run_cached_query(prompt: str) -> CachedAnalysisReport:
    start_time = time.perf_counter()

    print(f"Executing query against cached context: '{prompt}'...")
    result = await cached_agent.run(prompt)

    latency = (time.perf_counter() - start_time) * 1000
    report: CachedAnalysisReport = result.output
    report.latency_ms = round(latency, 2)

    # The original curriculum's version asked the MODEL to self-report a
    # `cache_hit_confirmed` boolean field - but a model genuinely has no
    # way to know whether OpenAI served its own system prompt from cache;
    # that information lives only in the API response's usage metadata,
    # never in anything the model itself can observe or report on. The
    # real, verifiable signal is result.usage's cache_read_tokens field.
    report.cache_read_tokens = result.usage.cache_read_tokens

    print("\n--- Agent Response Received ---")
    print(f"Latency: {report.latency_ms} ms")
    print(f"Cache Read Tokens: {report.cache_read_tokens}")
    print("Findings:")
    for finding in report.key_findings:
        print(f" - {finding}")

    return report


if __name__ == "__main__":

    async def main() -> None:
        print("--- Call 1: Initializing Cache ---")
        await run_cached_query("What vector store and fusion algorithm do we use for RAG?")

        print("\n" + "=" * 50 + "\n")

        print("--- Call 2: Reusing Cached Prompt Context ---")
        await run_cached_query("How do we handle observability and red-teaming security?")

    asyncio.run(main())
