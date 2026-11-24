"""Deterministic hash-based sampling for human review queues - Day 55.

This day is independently designed (not sourced from the PDF curriculum,
which ends at Day 54 in this repo's renumbering - see AGENTS.md) to close
out a round 56 with widely used eval-methodology patterns.

In a live agent system, routing every single production conversation to
a human reviewer doesn't scale, and routing a RANDOM sample makes the
review queue non-reproducible - the same conversation could be sampled
one day and not the next, making it impossible to audit "was this
specific incident ever reviewed?" after the fact. A deterministic
hash-based sampler solves this: hashing a stable identifier (e.g. a
conversation ID) into a fixed-width space and comparing against a
threshold means the SAME identifier always produces the SAME sampling
decision, at any sample rate, without storing any decision state at all.
"""

import asyncio
import hashlib


class DeterministicReviewSampler:
    def __init__(self, sample_rate: float):
        if not 0.0 <= sample_rate <= 1.0:
            raise ValueError(f"sample_rate must be between 0.0 and 1.0, got {sample_rate}")
        self.sample_rate = sample_rate
        # SHA-256 produces a 256-bit digest; using the first 8 hex chars
        # (32 bits) as an integer gives a wide enough space that the
        # sampling decision doesn't meaningfully cluster or bias.
        self._hash_space = 16**8

    def should_sample(self, stable_id: str) -> bool:
        """Deterministically decides whether an item should be routed to human review."""
        digest = hashlib.sha256(stable_id.encode()).hexdigest()
        bucket = int(digest[:8], 16)
        return (bucket / self._hash_space) < self.sample_rate


async def main() -> None:
    print("--- Test 1: The Same ID Always Produces the Same Decision ---")
    sampler = DeterministicReviewSampler(sample_rate=0.1)

    conversation_id = "conv_9f3a2b7c"
    decisions = [sampler.should_sample(conversation_id) for _ in range(5)]
    print(f"5 repeated calls for '{conversation_id}': {decisions}")
    assert len(set(decisions)) == 1, "BUG: the same ID produced different sampling decisions across repeated calls."
    print(f"[VERIFIED] All 5 calls for the same ID produced the identical decision ({decisions[0]}) - the sampler is genuinely deterministic.")

    # Real proof the sampling RATE is honored across a large population,
    # not just that individual decisions are stable - a CI gate on a
    # measured rate needs the rate itself to hold up at scale.
    print("\n--- Test 2: The Configured Sample Rate Holds Up Across a Large Population ---")
    target_rate = 0.1
    large_sampler = DeterministicReviewSampler(sample_rate=target_rate)
    population_size = 50_000
    sampled_count = sum(1 for i in range(population_size) if large_sampler.should_sample(f"conv_{i}"))
    observed_rate = sampled_count / population_size
    print(f"Target rate: {target_rate:.3f} | Observed rate over {population_size:,} IDs: {observed_rate:.4f}")
    assert abs(observed_rate - target_rate) < 0.01, (
        f"BUG: observed sample rate ({observed_rate:.4f}) deviates from the target ({target_rate:.3f}) by more than 1%."
    )
    print(f"[VERIFIED] Observed rate ({observed_rate:.4f}) is within 1% of the target ({target_rate:.3f}) across {population_size:,} distinct IDs.")

    # Real proof changing the sample rate genuinely changes WHICH items
    # get sampled at the margin, not just how many - critical for
    # understanding that raising the rate from 10% to 20% doesn't add a
    # totally unrelated random set, it's a strict superset.
    print("\n--- Test 3: Increasing the Sample Rate Produces a Strict Superset ---")
    low_rate_sampler = DeterministicReviewSampler(sample_rate=0.1)
    high_rate_sampler = DeterministicReviewSampler(sample_rate=0.2)
    low_rate_sampled = {f"conv_{i}" for i in range(population_size) if low_rate_sampler.should_sample(f"conv_{i}")}
    high_rate_sampled = {f"conv_{i}" for i in range(population_size) if high_rate_sampler.should_sample(f"conv_{i}")}
    assert low_rate_sampled.issubset(high_rate_sampled), (
        "BUG: raising the sample rate should only ADD items to the sampled set, but some 10%-sampled IDs are missing from the 20% set."
    )
    print(
        f"[VERIFIED] All {len(low_rate_sampled):,} IDs sampled at 10% are also included in the {len(high_rate_sampled):,} IDs sampled "
        "at 20% - raising the rate is a strict superset, never a disjoint re-roll."
    )


if __name__ == "__main__":
    asyncio.run(main())
