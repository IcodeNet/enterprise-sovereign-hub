Day 42 compacts old conversation turns into a structured digest once a threshold is reached - and finds a genuine, honest negative result: at this small conversation size, the "compacted" version was actually LARGER than the raw text it replaced.

---

## Memory & Context Management — Day 42: Agentic Self-Compaction & Hierarchical Memory Summarization

### The Problem We're Solving

As an agent's conversation history grows across dozens of turns, passing the entire raw message list into every prompt raises latency, token cost, and attention degradation (a model reasoning worse when its context window is stuffed with old, less-relevant text). Context compaction fixes this by summarizing older turns into a dense structured digest once a threshold is crossed, while keeping the most recent turns verbatim - so the active conversation's intent is never lost even as older history compresses.

Focus: automatic threshold-triggered compaction that preserves recent turns verbatim and folds older turns into a structured summary
Time investment: 15 minutes

### Step 1: Build the Compactable Session Memory

`apps/ai-engine/src/memory/context_compactor.py` tracks raw history, and once `len(self.history) >= self.compaction_threshold`, splits it: older turns get compacted by an agent into `CompactedMemorySummary`, the last 2 turns stay verbatim:

```python
if len(self.history) >= self.compaction_threshold:
    turns_to_compact = self.history[:-2]
    recent_turns = self.history[-2:]
    compaction_run = await compactor_agent.run(f"Previous Context Digest: {self.active_summary}\n\n...")
    data: CompactedMemorySummary = compaction_run.output
    self.active_summary = f"Narrative: {data.condensed_narrative} | Decisions: ... | Constraints: ..."
    self.history = recent_turns
```

### Step 2: Run and Verify - a Genuine, Honest Negative Result

The lesson's own claim is implicitly that compaction saves space. Rather than just trusting that, measured it directly:

```
[COMPACTION TRIGGERED] Turn count (6) reached threshold (4).
 [COMPACTED CONTEXT] New digest length: 426 chars

Raw history turns: 6 | Post-compaction turns kept verbatim: 2
Raw content chars: 383 | Compacted content chars: 539
```

**Real, honest finding: the compacted context (539 characters: the digest plus the 2 verbatim turns) was LARGER than the raw uncompacted history it replaced (383 characters).** At this small conversation scale (6 turns of short, already-terse technical statements), the structured digest's own formatting overhead (`"Narrative: ... | Decisions: ...; ...; ... | Constraints: ...; ...; ..."`) exceeded whatever the summarization actually saved.

---

## Best Practices

- **Measure the actual before/after size, don't assume compaction always shrinks context.** This lesson's own test case is a genuine counterexample: on a SHORT conversation of already-terse messages, a structured summary's formatting overhead can exceed the raw text it's replacing. Compaction's real value shows up at scale - dozens or hundreds of turns - not necessarily on a small demo-sized conversation.
- **A compaction pipeline's value proposition needs measuring against the actual conversation sizes it will see in production**, not assumed from the pattern's name. If most real sessions never exceed the threshold by much, the summarization overhead could genuinely make things worse in the common case, even while helping in the long-tail case of truly long conversations.
- **Report the real numbers even when they contradict the lesson's own implicit premise.** This is exactly the kind of honest negative finding this repo's discipline exists to surface, rather than describing compaction as "reducing token cost" without ever actually checking.

## Why This Matters in Production

A technique that's genuinely valuable at production scale (dozens of long-running agent sessions, hundreds of turns) can look counterproductive when tested on a small, convenient example - and only measuring the real before/after numbers, rather than trusting the pattern's name, reveals which regime you're actually in. This doesn't invalidate context compaction; it means the compaction THRESHOLD and the expected conversation length both matter for whether it actually helps.

## Note: Numbering Duplication Found

A later numbering review found a near-exact duplicate of this algorithm under another day number: the same split-older-turns-into-a-summary-node pattern (compress older turns, keep an accumulating summary), with only different naming. This day keeps the implementation and measurements focused on the working compaction strategy.
