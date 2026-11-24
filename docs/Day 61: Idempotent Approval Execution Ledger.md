Day 61 adds a deterministic execution ledger so an approved high-risk action runs at most once, even when the same request is retried.

---

## Resilience & Safety — Day 61: Idempotent Approval Execution Ledger

### The Problem We're Solving

Day 60 gave us a human approval gate, but one gap remains: what happens when the client retries the same approved action.

Without an idempotent execution ledger (a write-once record keyed by approval id), retries can trigger duplicate side effects.

This day builds a deterministic post-approval execution control:

- no decision -> block,
- rejected decision -> block,
- approved decision first call -> execute,
- approved decision retries -> do not execute again; return the original execution id.

Focus: once-only execution after approval
Time investment: 15 minutes

### Step 1: Build the Ledger

`apps/ai-engine/src/agents/approval_execution_ledger.py` defines:

- `ApprovalDecision` and `ExecutionOutcome` contracts,
- `ApprovalExecutionLedger.record_decision()` for explicit reviewer outcomes,
- `ApprovalExecutionLedger.execute_if_approved()` for deterministic once-only execution keyed by `approval_id`.

### Step 2: Prove 5 Cases

1. missing decision -> blocked.
2. rejected decision -> blocked.
3. approved decision first call -> executed.
4. retry with same approval id -> duplicate replay (no new side effect).
5. different approved id -> executes independently.

### Step 3: Run and Verify — Real Output

Command:

`python apps/ai-engine/src/agents/approval_execution_ledger.py`

Output:

```
--- Test 1: Missing decision is blocked ---
Result: status=blocked_no_decision, executed=False, reason=no approval decision recorded
[VERIFIED] Action did not run without a recorded decision.

--- Test 2: Rejected decision is blocked ---
Result: status=blocked_rejected, executed=False, reason=rejected by reviewer-risk: beneficiary details incomplete
[VERIFIED] Rejected approval never reached side effects.

--- Test 3: Approved decision executes once ---
Result: status=executed, executed=True, execution_id=exec-appr-approved, reason=approved by reviewer-ops: destination and amount verified
[VERIFIED] Approved action executed exactly once on first call.

--- Test 4: Retry replay does not execute again ---
Result: status=duplicate_replay, executed=False, execution_id=exec-appr-approved, reason=already executed for this approval id
[VERIFIED] Duplicate replay reused the original execution id with no new side effect.

--- Test 5: Different approval id can execute independently ---
Result: status=executed, executed=True, execution_id=exec-appr-approved-2, reason=approved by reviewer-ops: second transfer approved
[VERIFIED] A new approval id created one new execution as expected.
```

Additional check run:

- `python -m py_compile apps/ai-engine/src/agents/approval_execution_ledger.py` -> pass

## Best Practices

- Separate approval decision state from execution state.
- Use approval id as the idempotency key for side-effect execution.
- Return the original execution id on replay so callers can reconcile safely.

## Why This Matters in Production

This closes the duplicate-side-effect gap after human approval. Eunomia and Skill Reporter can now enforce both controls together: high-risk actions need approval, and approved actions run only once.