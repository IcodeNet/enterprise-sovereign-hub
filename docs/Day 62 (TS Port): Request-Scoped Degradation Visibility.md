TypeScript port of Day 62 with the same request-scoped degradation event model.

---

## Resilience & Safety — Day 62 (TS Port): Request-Scoped Degradation Visibility

Implementation file:

- `apps/web/src/agents/degradation-visibility.ts`

Shared behavior with Python:

- healthy requests produce zero degradation events,
- classifier timeout records a medium-severity fallback event,
- retrieval outage records a high-severity fallback event,
- combined failures record both events in one request trace.

### Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/degradation-visibility.ts`

Output:

```
--- Test 1: Healthy path stays non-degraded ---
Result: degraded=false, events=0, reply=Answer from docs with evidence citations.
[VERIFIED] Healthy path produced no degradation events.

--- Test 2: Classifier timeout records degradation and fallback ---
Result: degraded=true, events=1, reply=Answer from docs with evidence citations.
[VERIFIED] Timeout was captured with fallback metadata (rule_based_intent=faq).

--- Test 3: Retrieval outage records high-severity degradation ---
Result: degraded=true, events=1, reply=Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now.
[VERIFIED] Retrieval outage was recorded as high-severity with fallback=safe_no_context_answer.

--- Test 4: Dual failures preserve both events in one request trace ---
Result: degraded=true, events=2, reply=Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now.
[VERIFIED] Multiple degradations were captured in one request-scoped trace.
```

Checks run:

- `cd apps/web && npx oxfmt --check src/agents/degradation-visibility.ts` -> pass
- `cd apps/web && npx oxlint src/agents/degradation-visibility.ts` -> pass

This keeps degradation telemetry behavior aligned between Python and TypeScript for the same failure signals.