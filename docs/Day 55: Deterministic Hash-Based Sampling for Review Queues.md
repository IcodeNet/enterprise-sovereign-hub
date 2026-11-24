Day 55 samples which production conversations get routed to a human reviewer using a deterministic hash of a stable ID, and proves three real properties any sampler like this needs: it's reproducible, its rate holds at scale, and raising the rate never re-rolls the set from scratch.

---

## Observability & Eval Methodology — Day 55: Deterministic Hash-Based Sampling for Human Review Queues

This day is independently designed. It generalizes a widely used eval-methodology pattern for deterministic human-review sampling.

### The Problem We're Solving

In a live agent system, routing every single production conversation to a human reviewer doesn't scale - but routing a RANDOM sample makes the review queue non-reproducible. If sampling is random, the same conversation could be flagged for review one day and not the next, making it impossible to answer "was this specific incident ever actually reviewed?" after the fact, or to re-run last week's sample for an audit. A deterministic hash-based sampler fixes this: hash a stable identifier into a fixed-width space and compare against a threshold - the SAME identifier always produces the SAME decision, at any sample rate, with zero stored state.

Focus: SHA-256-based deterministic sampling, with 3 real properties directly proven rather than assumed
Time investment: 15 minutes

### Step 1: Build the Sampler

`apps/ai-engine/src/observability/review_queue_sampler.py`'s `DeterministicReviewSampler` hashes the ID, takes the first 8 hex characters as a 32-bit integer, and compares its position in that space against the configured rate:

```python
def should_sample(self, stable_id: str) -> bool:
    digest = hashlib.sha256(stable_id.encode()).hexdigest()
    bucket = int(digest[:8], 16)
    return (bucket / self._hash_space) < self.sample_rate
```

### Step 2: Prove 3 Real Properties, Not Just "It Ran Without Error"

1. **Reproducibility**: the SAME ID must produce the SAME decision every time.
2. **Rate accuracy at scale**: a 10% configured rate must produce close to 10% sampled across a large population - not just look plausible on a handful of examples.
3. **Monotonic supersetting**: raising the rate from 10% to 20% must ADD to the sampled set, never replace it with an unrelated random 20%.

### Step 3: Run and Verify - All 3, Real Results

```
5 repeated calls for 'conv_9f3a2b7c': [False, False, False, False, False]
[VERIFIED] All 5 calls for the same ID produced the identical decision (False) - the sampler is genuinely deterministic.

Target rate: 0.100 | Observed rate over 50,000 IDs: 0.1006
[VERIFIED] Observed rate (0.1006) is within 1% of the target (0.100) across 50,000 distinct IDs.

[VERIFIED] All 5,030 IDs sampled at 10% are also included in the 10,021 IDs sampled at 20% - raising the rate is a strict superset, never a disjoint re-roll.
```

All 3 properties genuinely hold: repeatable decisions, a rate that lands within 0.06 percentage points of target across 50,000 distinct IDs, and a verified subset relationship between the 10% and 20% sampled sets.

---

## Best Practices

- **Test the sampling RATE against a large population, not a handful of anecdotal IDs.** A handful of examples can look "roughly right" by chance; 50,000 distinct IDs is what actually proves the hash distribution doesn't cluster or bias away from the configured rate.
- **Explicitly verify the superset property when a sampler supports variable rates.** This matters operationally: an incident investigation asking "was conversation X in last month's 10% sample?" needs a reliable yes/no that doesn't change retroactively just because the rate was later raised to 20% - and needs raising the rate to genuinely mean "review more," not "review a different, unrelated set."
- **A stable identifier (not a random seed) is the whole point.** Using the conversation's own ID as the hash input, rather than a stored random number, is what makes the sampling decision reconstructible without a database - anyone with the ID and the rate can recompute the exact same decision independently.

## Why This Matters in Production

A review queue that can't answer "would this exact item have been sampled last week" defeats its own purpose as an audit mechanism - and a sampler whose rate doesn't actually hold at scale silently under- or over-loads the human reviewers downstream. Both properties are easy to assume and easy to get subtly wrong; proving them against a real 50,000-item population is the only way to know they actually hold.
