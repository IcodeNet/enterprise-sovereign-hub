TypeScript port of Day 59 using the same evaluator states and transition semantics.

---

## Resilience & Safety — Day 59 (TS Port): Stateful Evaluator Graph

Implementation file:

- `apps/web/src/agents/stateful-evaluator-graph.ts`

Shared behavior with Python:

- explicit state machine transitions,
- same terminal states,
- same attempt-cap behavior.

Emphasis carried from the main lesson:

The real problem is deciding the next operational step from state, not just generating text. The graph owns step order, branch rules, and state updates. LLMs still do useful work inside steps (for example, extracting entities and intent from the customer question), but they do not directly decide control flow.

Relationship to Day 5: same graph pattern, different scope. Day 5 used graph-driven routing for general workflow nodes; Day 59 uses graph-driven routing for evaluator control flow and terminal decision states.

### Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/stateful-evaluator-graph.ts`

Output:

```
--- Test 1: First attempt clears threshold -> approved ---
Terminal: approved, attempts=1, score=0.92
[VERIFIED] Graph approved immediately when score met threshold.

--- Test 2: Revision path then approval on second attempt ---
Terminal: approved, attempts=2, score=0.91
[VERIFIED] Graph moved through NEEDS_REVISION and approved after retry.

--- Test 3: Exhaust attempts -> rejected ---
Terminal: rejected, attempts=3, score=0.7
[VERIFIED] Graph rejected exactly at the configured attempt cap.
```

Checks run:

- `npx oxfmt --check src/agents/stateful-evaluator-graph.ts` -> pass
- `npx oxlint src/agents/stateful-evaluator-graph.ts` -> pass

This keeps evaluator-state behavior consistent across both language stacks.