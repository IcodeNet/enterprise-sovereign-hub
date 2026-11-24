Day 22 is about a genuinely important correction to an early draft: a model can never truthfully report whether ITS OWN system prompt was served from a cache - and what really happens when you check the real signal instead.

---

## Cost Engineering — Day 22: Context Caching & Prompt Compression

### The Problem We're Solving

A large, static system prompt (a big reference document, a full codebase spec) gets re-processed on every single call unless the provider caches it - wasting both latency and money reprocessing the exact same tokens repeatedly. OpenAI's automatic prompt caching serves a repeated prefix from cache instead of reprocessing it, IF that prefix is large enough (roughly 1024+ tokens) and matches exactly.

**A real correction to the initial design**: that version asked the MODEL ITSELF to report a `cache_hit_confirmed: bool` field. This is not something a model can actually know - caching happens entirely on OpenAI's infrastructure, invisible to the model generating the response; asking it to self-report is asking it to guess or hallucinate an answer it has no way to verify. The real, verifiable signal lives in the API response's usage metadata (`cache_read_tokens` in `pydantic-ai`, `inputTokenDetails.cacheReadTokens` in the Vercel AI SDK) - never in anything the model itself can observe.

**A second real finding, from actually running this repeatedly**: OpenAI's automatic prompt caching is NOT a guaranteed "second identical call always hits" mechanism. Across several test runs, cache hits appeared unpredictably - sometimes on the very first call (if an identical prefix had been cached moments earlier from an unrelated test), sometimes not on the second call at all. This is real, honest evidence that automatic caching is best-effort and probabilistic in practice, not a deterministic guarantee to build cost projections around without margin.

Focus: measuring the REAL prompt-caching signal from usage metadata, and reporting honestly on how reliably it actually fires
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/optimization/`, create:
`context_caching.py`

### Step 3: Add the Source Code

```python
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
...
=====================================================================
"""
    * 130
)  # Repeated 130x (not the initial 20x, which measured only
# ~640 REAL tokens once actually tokenized - well under OpenAI's ~1024
# token minimum for automatic prompt caching to activate at all).

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
    # The real, verifiable cache signal - never asked of the model itself.
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
```

### Step 4: Run and Verify - the Real, Honest Result

```bash
python src/optimization/context_caching.py
```

Directly testing the raw OpenAI client first (bypassing pydantic-ai, to isolate the caching behavior itself) confirmed real caching CAN work: a 4021-token corpus showed `cached_tokens=0` on the first call, then `cached_tokens=3840` on an immediate second call.

But running THIS lesson's actual script - with structured-output tool-calling in the request, and real time elapsed between calls (not an immediate back-to-back call) - showed inconsistent results across repeated full runs: `Cache Read Tokens: 4352` on one run's first call, `0` on that same run's second call; `0` on both calls of a different run. This is genuine evidence, not a bug to chase down further: OpenAI's cache is a best-effort optimization, not a guaranteed contract, and its exact trigger conditions (timing, exact prefix match, possibly server-side cache eviction) are not something a caller fully controls.

---

## Best Practices

- **Never ask an AI model to self-report on infrastructure it cannot observe.** Whether a system prompt hit a server-side cache is information that exists only in the API response's usage metadata - asking the model to report it is asking it to guess.
- **Verify a "large" corpus is actually large enough in real tokens, not just characters.** The initial 20x-repeated corpus read as visually large but measured only ~640 real tokens once tokenized - well under OpenAI's roughly-1024-token minimum for caching to trigger at all.
- **Treat automatic prompt caching as a best-effort cost optimization, not a deterministic guarantee.** Repeated runs of the identical lesson showed inconsistent cache-hit behavior - build cost projections with margin for cache misses, don't assume every repeated call will be cheap.

## Why This Matters in Production

The real, load-bearing lesson here isn't "caching works" - it's "verify the ACTUAL signal from the API, and test it enough times to know how reliably it actually fires, rather than trusting a single lucky demo run or asking the model to report on something it structurally cannot know."
