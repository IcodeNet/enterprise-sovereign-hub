Day 43's TypeScript port builds the same transactional reflection loop, and this run happened to capture a genuine, live rejection-then-recovery cycle on the ORIGINAL task itself - the critic really did reject the first draft's missing type annotations, and the second draft, generated with that real feedback, fully passed.

---

## Self-Correction & State Management — Day 43 (TS Port): Autonomous Agent Self-Reflection & Multi-Turn State Rollbacks

### The Problem We're Solving

Same problem as the Python lesson: an agent that continues past a flawed draft poisons its own future context with the failure. A transactional reflection loop snapshots state, critiques the draft against explicit invariants, and rolls back on rejection.

Focus: the same snapshot-generate-critique-rollback loop, built with `generateObject`
Time investment: 15 minutes

Attribution note:
- This lesson applies principles from Sam Bhagwat's "Principles of Building AI Agents" and pattern framing from "Patterns for Building AI Agents" (Sam Bhagwat and Michelle Gienow, mastra.ai): keep state transitions explicit, reject weak drafts safely, and prove recovery behavior from real runs.

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the draft output shape (`class SystemDesignDraft(BaseModel)`) | the draft output shape (`const SystemDesignDraftSchema = z.object({...})`) |
| the critique output shape (`class CritiqueVerdict(BaseModel)`) | the critique output shape (`const CritiqueVerdictSchema = z.object({...})`) |
| the transactional state manager (`class TransactionalSessionState`) | the transactional state manager (`class TransactionalSessionState`) |
| snapshotting state (`copy.deepcopy(self.committed_history)`) | snapshotting state (`[...this.committedHistory]`, a shallow spread - sufficient here since entries are plain strings, not nested objects) |
| running the generator (`await generator_agent.run(...)`) | running the generator (`await generateObject({ model, schema, prompt })` in `generateDraft`) |

### Step 1: Build the Pipeline

Structurally identical to the Python side.

### Step 2: Run and Verify - a Genuine, Live-Captured Rejection on This Run's First Attempt

Unlike the Python side (whose first attempt on the Redis client task passed cleanly, requiring a different task to capture a real rejection), THIS run's TypeScript generation genuinely failed on turn 1:

```
--- Reflection Loop Turn 1/3 ---
Generated Component: 'ResilientRedisClient'
Critic Review: Passed=false | Score=5/10
Feedback: The code successfully implements retry logic using the `connectWithBackoff` method...
However, type annotations are missing in several places.
### Missing Type Annotations:
1. Constructor parameters should have explicit type annotations: maxRetries: number = 5, initialDelay: number = 1000
2. The method `delay` should explicitly indicate it returns a Promise<void>.
...
 [ROLLBACK] Reverted memory state to pre-transaction checkpoint.

--- Reflection Loop Turn 2/3 ---
[generates a corrected draft with the missing type annotations added]
[TRANSACTION COMMITTED] Output approved and state updated.
```

A real, live, unforced example of the entire intended cycle: generate → genuinely fail a real invariant → roll back → retry with the actual critique injected → fully pass. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **Run the exact same test in a second language rather than assuming the first language's result generalizes.** The Python side's first attempt happened to pass; the TypeScript side's first attempt on the SAME described task genuinely failed - different model, different generated code, different real outcome. Neither result is "the" answer; both are real, valid single data points.
- **When a live rejection genuinely occurs, that's the best possible evidence for this pattern - better than a directly-unit-tested rollback alone.** The direct rollback-mechanism test (see the Python doc) proves the STATE MANAGEMENT is correct; a live, naturally-occurring rejection-and-recovery cycle proves the WHOLE LOOP behaves as designed end to end, under real, unscripted model output.

## Why This Port Matters in Production

Building the identical pipeline in a second language and running it independently is itself a form of extra verification - this run happened to genuinely exercise the full reject → rollback → retry → commit cycle that the Python lesson had to go looking for with a different task, giving a second, independent, real confirmation that the pattern behaves correctly under an actual model failure rather than only under a contrived one.
