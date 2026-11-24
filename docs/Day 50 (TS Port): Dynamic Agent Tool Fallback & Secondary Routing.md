Day 50's TypeScript port builds the same SLA-timeout fallback with `Promise.race` in place of `asyncio.wait_for`, and catches a real, more subtle bug: the structured-answer extraction step silently discarded the tool's own precise output in favor of the model's vague natural-language paraphrase.

---

## Resilience & Concurrency — Day 50 (TS Port): Dynamic Agent Tool Fallback & Secondary SLA Routing

### The Problem We're Solving

Same problem as the Python lesson: a tool call needs a strict latency SLA with an automatic fallback to a faster secondary provider when the primary blows through it.

Focus: `Promise.race` as TS's equivalent of `asyncio.wait_for`, plus a real extraction bug distinct from Python's
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the hard timeout guard (`asyncio.wait_for(primary_market_data_api(isin), timeout=sla_timeout_seconds)`) | the hard timeout guard (`withTimeout(primaryMarketDataApi(), slaTimeoutMs)`, built on `Promise.race` against a rejecting timer) |
| the tool's self-reported latency (`elapsed = (time.monotonic() - start_time) * 1000`) | the tool's self-reported latency (`elapsed = performance.now() - startTime`) |
| the structured final report (agent's own `output_type=ValuationReport`) | the structured final report (a separate `generateObject` extraction call) |

### Step 1: Build the Timeout Guard

TypeScript has no built-in `asyncio.wait_for` equivalent, so `withTimeout()` races the real API call against a timer that rejects after the SLA window - whichever settles first wins, and the timer is always cleared in a `finally` to avoid a dangling handle.

### Step 2: Find and Fix a Real, Distinct Extraction Bug

The first working version produced a WRONG final report: `Data Source: primary` and `Execution Latency: 0.0 ms`, even though the console logs clearly showed the fallback firing correctly. Printing the raw agent transcript text revealed the cause: `generateText`'s final `text` is the model's natural-language SUMMARY of what happened ("The current yield rate... is 4.2%"), which drops the tool's own precise return string (`Provider: SECONDARY_FALLBACK | Yield: 4.2% | Latency: 550.9ms`) entirely. Fixed by extracting structure from the RAW `toolResults` output instead of the model's paraphrase of it.

### Step 3: Run and Verify Both Branches - Real Results, Bug Fixed

```
[ALERT]: Primary provider for GB00BM8Z2S21 exceeded 500ms SLA (TimeoutError). Routing to fallback.
=== Final Validated Report ===
Data Source: SECONDARY_FALLBACK
Execution Latency: 551.4 ms
[VERIFIED] Tool's own reported latency (551.4ms) confirms the SLA timeout genuinely fired before the primary's full 1.5s delay.

--- Test 2: Primary Within SLA (No Fallback Should Occur) ---
[VERIFIED] Provider: PRIMARY_LIVE | Yield: 4.25% | Latency: 100.5ms (no fallback triggered)
```

Both scenarios now match Python's qualitative results correctly. `tsc --noEmit` clean; `oxlint` clean after fixing one `unicorn/consistent-function-scoping` finding (an inline function that captured nothing from its enclosing scope, moved to module level). `npm audit` unchanged.

---

## Best Practices

- **When an agent's tool returns a precisely-formatted string, extract structure from that RAW string, not from the model's own paraphrase of it in its final answer.** `generateText`'s `text` field is written for a human to read, not for a downstream parser - it happily drops exact figures the model judged unimportant to restate. `toolResults` preserves what the tool actually returned.
- **A cross-language port surfacing a DIFFERENT bug than the source language is itself valuable, distinct information.** Python's version of this day had no analogous bug at all (its structured output comes directly from the agent's own `output_type`, with no separate paraphrase-then-re-extract step) - this TS-specific failure mode exists specifically because of the two-step generateText-then-generateObject pattern this port's architecture uses.

## Why This Port Matters in Production

The two languages' different approaches to producing a structured final answer - Python's single agent call with a native `output_type`, versus this port's separate extraction step - aren't just a stylistic difference. They have genuinely different failure modes: Python risks losing track of an earlier tool result's numeric VALUE (Day 47's finding), while this port risks losing an earlier tool result's PRECISE TEXT to the model's own summarization. Both are real, and neither would be found without actually running the code and checking the output against ground truth.
