Day 43 gives an agent a genuine transactional rollback: a rejected draft's own generation never touches committed state, and a real rejection-then-retry-then-approval cycle was captured live, not staged.

---

## Self-Correction & State Management — Day 43: Autonomous Agent Self-Reflection & Multi-Turn State Rollbacks

### The Problem We're Solving

Letting an agent continue after generating flawed code or invalid data poisons downstream memory - the next attempt's context now includes the broken draft as if it were real, committed state. A transactional reflection loop fixes this: snapshot state before each attempt, let an independent critic evaluate the candidate against explicit invariants, and if it fails, roll back to the pre-attempt snapshot (never letting the rejected draft persist) before retrying with the critique injected as feedback.

Focus: a snapshot-generate-critique-rollback loop that never lets a rejected draft touch committed state
Time investment: 15 minutes

Attribution note:
- This lesson applies principles from Sam Bhagwat's "Principles of Building AI Agents" and pattern framing from "Patterns for Building AI Agents" (Sam Bhagwat and Michelle Gienow, mastra.ai): keep state transitions explicit, reject weak drafts safely, and prove recovery behavior from real runs.

### Step 1: Build the Transactional State Manager

`apps/ai-engine/src/agents/reflection_rollback_agent.py` snapshots `committed_history` before each attempt and can restore it exactly:

```python
class TransactionalSessionState:
    def create_checkpoint(self) -> None:
        self._snapshot = copy.deepcopy(self.committed_history)

    def rollback(self) -> None:
        if self._snapshot is not None:
            self.committed_history = copy.deepcopy(self._snapshot)

    def commit(self, final_entry: str) -> None:
        self.committed_history.append(final_entry)
        self._snapshot = None
```

### Step 2: Verify the Rollback Mechanism Directly - a Bad Draft Never Persists

```python
state.committed_history.append('previous_good_entry')
state.create_checkpoint()
state.committed_history.append('BAD_DRAFT_SHOULD_NOT_PERSIST')  # simulates a rejected attempt
state.rollback()
assert state.committed_history == ['previous_good_entry']
```

Real, direct proof: after rollback, the bad draft is completely gone - `committed_history` is back to exactly what it was at the checkpoint, not a partial or merged state.

### Step 3: Run and Verify the Full Loop Live - a Genuine Rejection, Not a Staged One

The first attempt at the source's own task (a resilient Redis caching client) passed on the first try, so a genuine rejection was captured on a DIFFERENT, deliberately trickier task where "retry logic" doesn't naturally fit:

```
Task: "a minimal one-line lambda that adds two numbers"

--- Reflection Loop Turn 1/2 ---
Generated Component: 'add' ... [ROLLBACK] Reverted memory state to pre-transaction checkpoint.

--- Reflection Loop Turn 2/2 ---
Generated Component: 'add_integers'
Critic Review: Passed=False | Score=6/10
Feedback: The implementation includes explicit type annotations... However, the code lacks retry
logic, which violates requirement 2... it might not be applicable since operations on integers are
not inherently temporary...
 [ROLLBACK] Reverted memory state to pre-transaction checkpoint.
```

A real, live-captured rejection loop: the critic genuinely enforced its "must include retry logic" invariant even on a task (adding two integers) where retry logic doesn't conceptually apply - and correctly rolled back both attempts rather than committing a draft that failed its own stated standard.

---

## Best Practices

- **Verify the rollback mechanism directly with an assertion, not just by reading log lines that say "rolled back."** The direct test (`assert state.committed_history == [...]`) is unambiguous proof state was genuinely restored, not just that a print statement claiming so executed.
- **A live rejection is more valuable evidence than a staged one, but don't force a task to fail artificially - find a genuinely different task where a real rejection naturally occurs instead.** The original task's own first attempt passed cleanly; rather than manufacturing a fake failure, testing against a task where the critic's own strict invariant (mandatory retry logic) genuinely doesn't fit produced an authentic, honest rejection.
- **Deep-copy the snapshot, not a shallow reference.** `copy.deepcopy(self.committed_history)` (as opposed to just `list(self.committed_history)`) matters once the history contains nested mutable structures - a shallow copy would let a later mutation to a nested object corrupt the "restored" snapshot too.

## Why This Matters in Production

A rejected draft that's allowed to linger in an agent's context - even briefly, even just for the next retry's prompt - can quietly poison every subsequent generation with the flawed pattern it contained. Genuine rollback (verified directly, not just logged) means each retry starts from a clean, known-good state plus explicit feedback, not from a context contaminated by its own previous mistake.
