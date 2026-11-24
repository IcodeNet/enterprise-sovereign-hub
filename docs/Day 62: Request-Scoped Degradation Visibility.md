Day 62 adds request-scoped degradation tracking so fallback behavior stays visible and auditable instead of silently hidden in logs.

---

## Resilience & Safety — Day 62: Request-Scoped Degradation Visibility

### The Problem We're Solving

Fallbacks keep systems available, but silent fallbacks hide risk.

If a classifier times out or retrieval goes down and we quietly continue, operators lose the evidence they need to judge response quality and release safety. One request can also hit multiple degraded components, so a single boolean flag is not enough.

This day adds a request-scoped degradation trace:

- each degraded component records an event,
- each event records reason, severity, and fallback path,
- the final response still returns, but with explicit degradation evidence.

Focus: preserve availability without losing runtime truth
Time investment: 15 minutes

### Step 1: Build the Degradation Trace Model

`apps/ai-engine/src/agents/degradation_visibility.py` defines:

- `RequestTrace` to hold per-request degradation events,
- `DegradationEvent` with `component`, `reason`, `severity`, `fallback_used`,
- deterministic fallback behavior for classifier timeout and retrieval outage.

### Step 2: Prove 4 Cases

1. healthy request -> no degradation events.
2. classifier timeout -> one medium-severity event with rule-based fallback.
3. retrieval outage -> one high-severity event with safe no-context answer.
4. combined failure -> both events preserved in one request trace.

### Step 3: Run and Verify — Real Output

Command:

`python apps/ai-engine/src/agents/degradation_visibility.py`

Output:

```
--- Test 1: Healthy path stays non-degraded ---
Result: degraded=False, events=0, reply=Answer from docs with evidence citations.
[VERIFIED] Healthy path produced no degradation events.

--- Test 2: Classifier timeout records degradation and fallback ---
Result: degraded=True, events=1, reply=Answer from docs with evidence citations.
[VERIFIED] Timeout was captured with fallback metadata (rule_based_intent=faq).

--- Test 3: Retrieval outage records high-severity degradation ---
Result: degraded=True, events=1, reply=Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now.
[VERIFIED] Retrieval outage was recorded as high-severity with fallback=safe_no_context_answer.

--- Test 4: Dual failures preserve both events in one request trace ---
Result: degraded=True, events=2, reply=Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now.
[VERIFIED] Multiple degradations were captured in one request-scoped trace.
```

Additional check run:

- `python -m py_compile apps/ai-engine/src/agents/degradation_visibility.py` -> pass

## Best Practices

- Record degradation events at the point of fallback, not only at request end.
- Store severity and fallback metadata so operators can triage quickly.
- Allow safe completion, but never hide degraded paths from telemetry.

## Why This Matters in Production

Eunomia and Skill Reporter need both availability and accountability. This pattern keeps responses flowing while preserving exact evidence of degraded execution paths for review, rollout, and incident analysis.