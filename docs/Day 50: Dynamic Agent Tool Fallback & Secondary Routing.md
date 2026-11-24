Day 50 gives a tool call a strict latency SLA and an automatic fallback to a faster secondary provider, and catches a real assertion mistake (checking total agent time instead of the tool's own bounded latency) before it produced a false failure.

---

## Resilience & Concurrency — Day 50: Dynamic Agent Tool Fallback & Secondary SLA Routing

### The Problem We're Solving

Third-party APIs and microservice endpoints degrade unpredictably in production - latency spikes, timeouts, unexpected downtime. A resilient agent should monitor round-trip latency against a strict SLA (service-level agreement - a maximum acceptable response time), and when the primary provider blows through that ceiling, fall back to a secondary provider automatically, without ever surfacing the failure to the user.

Focus: `asyncio.wait_for` as a hard timeout guard, with a genuine second scenario proving the router does NOT fall back unnecessarily
Time investment: 15 minutes

### Step 1: Build the Fallback Router

`apps/ai-engine/src/resilience/tool_fallback_router.py`'s `fetch_benchmark_valuation` wraps the primary provider call in a strict 500ms timeout window, routing to a fast secondary cache on any failure:

```python
try:
    yield_rate = await asyncio.wait_for(primary_market_data_api(isin), timeout=sla_timeout_seconds)
    ...
except (asyncio.TimeoutError, Exception) as err:
    yield_rate = await secondary_cache_data_api(isin)
    ...
```

### Step 2: Verify the SLA Timeout Genuinely Fires - and Catch a Verification Mistake

The first attempt at verifying the fallback checked the TOTAL agent wall-clock time against the SLA window - and it FAILED, even though the fallback genuinely fired correctly. The bug was in the check, not the code: total time includes the LLM's own round-trip overhead (deciding to call the tool, then producing the structured report), which has nothing to do with the tool's own SLA-bounded latency. Fixed by checking the tool's OWN reported `execution_latency_ms` figure instead - the number the tool itself measured around just its provider call, not the whole agent turn.

### Step 3: Run and Verify Both Branches - Real Results

```
[ALERT]: Primary provider exceeded 0.5s SLA (TimeoutError). Routing to fallback.
=== Final Validated Report ===
Data Source: SECONDARY_FALLBACK
Execution Latency: 550.9 ms
[VERIFIED] Tool's own reported latency (550.9ms) confirms the SLA timeout genuinely fired before the primary's full 1.5s delay.

--- Test 2: Primary Within SLA (No Fallback Should Occur) ---
[VERIFIED] Provider: PRIMARY_LIVE | Yield: 4.25% | Latency: 100.3ms (no fallback triggered)
```

The source's own demo only ever exercised the "primary always too slow" path. Added Test 2 - a genuinely fast primary that's well within the 500ms SLA - and confirmed the router correctly does NOT fall back when it doesn't need to, proving the timeout logic discriminates correctly rather than always routing to the fallback regardless.

---

## Best Practices

- **When measuring whether a specific operation stayed within a latency budget, measure THAT operation's own duration - never the whole surrounding call chain.** A wrong check that measures total agent time silently includes unrelated LLM overhead; the fix measures the tool's own self-reported timing, isolated from everything around it.
- **Test both "the fallback fires when it should" AND "the fallback does NOT fire when it shouldn't."** A router that always falls back regardless of the primary's actual speed would pass the first test and still be a real bug - Test 2 (fast primary, no fallback) is what actually proves the SLA check discriminates rather than just always choosing the secondary.
- **A failing test caught by YOUR OWN verification code is still worth reporting as a finding, even when the root cause is in the check, not the feature.** Documenting why the check is wrong and how it is fixed is more valuable to a reader than silently rewriting the check.

## Why This Matters in Production

SLA-driven fallback routing is only as trustworthy as the proof that the timeout genuinely cuts the slow path short - and that proof has to be measured on the RIGHT clock. This day's real finding (a verification bug, not a feature bug) is a useful reminder that "my test failed" doesn't automatically mean "my feature is broken" - sometimes it means the test itself measured the wrong thing.
