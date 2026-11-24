Day 59 turns evaluator retries into an explicit state graph with visible transitions and terminal states.

---

## Resilience & Safety — Day 59: Stateful Evaluator Graph

### The Problem We're Solving

When evaluation retry logic is buried in nested conditionals, it is hard to answer:

- why a response was approved,
- why it was rejected,
- whether retry limits were respected.

This day models evaluator flow as an explicit graph with named states and terminal outcomes.

Relationship to Day 5: this is the same core graph idea applied at a different layer. Day 5 used a stateful graph for workflow routing across task nodes. Day 59 uses a stateful graph for evaluator operations, where the graph decides the next operational step from current state.

The real problem is deciding the next operational step from state, not just generating text. The role of the graph is to make that control flow explicit: it owns step order, branch rules, and state updates. LLMs still do useful work inside steps (for example, extracting entities and intent from the customer question), but they do not directly decide control flow.

That control split is the lesson emphasis for Day 59: state-machine logic governs operations, while model inference is constrained to bounded step-local tasks.

Focus: explicit state transitions and terminal-state determinism
Time investment: 15 minutes

### Step 1: Define the Graph

`apps/ai-engine/src/agents/stateful_evaluator_graph.py` uses:

- states: `DRAFT`, `EVALUATING`, `NEEDS_REVISION`, `APPROVED`, `REJECTED`,
- transition function: `step(context)`,
- driver: `run_graph(scores, threshold, max_attempts)`.

### Step 2: Validate Three Paths

1. score clears threshold on first evaluation -> `APPROVED`.
2. first score fails, revision score passes -> `APPROVED` on second attempt.
3. repeated low scores to max attempt -> `REJECTED` at cap.

### Step 3: Run and Verify — Real Output

Command:

`cd apps/ai-engine && python src/agents/stateful_evaluator_graph.py`

Output:

```
--- Test 1: First attempt clears threshold -> approved ---
Terminal: EvalState.APPROVED, attempts=1, score=0.92
[VERIFIED] Graph approved immediately when score met threshold.

--- Test 2: Revision path then approval on second attempt ---
Terminal: EvalState.APPROVED, attempts=2, score=0.91
[VERIFIED] Graph moved through NEEDS_REVISION and approved after retry.

--- Test 3: Exhaust attempts -> rejected ---
Terminal: EvalState.REJECTED, attempts=3, score=0.7
[VERIFIED] Graph rejected exactly at the configured attempt cap.
```

Additional check:

- `python -m py_compile src/agents/stateful_evaluator_graph.py` -> pass

## Best Practices

- Use explicit terminal states (`APPROVED`, `REJECTED`) instead of implicit returns.
- Keep attempt increments inside transition logic so caps are enforceable by construction.
- Treat graph transitions as audit artifacts, not implementation detail.

## Why This Matters in Production

A stateful evaluator graph makes release decisions explainable and testable under retry pressure, which is required for operational trust in production agent systems.