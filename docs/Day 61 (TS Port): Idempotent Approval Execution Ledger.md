TypeScript port of Day 61 with the same once-only post-approval execution control.

---

## Resilience & Safety — Day 61 (TS Port): Idempotent Approval Execution Ledger

Implementation file:

- `apps/web/src/agents/approval-execution-ledger.ts`

Shared behavior with Python:

- missing decision blocks execution,
- rejected decision blocks execution,
- first approved call executes,
- replay with same approval id does not re-run side effects,
- second approval id executes independently.

### Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/approval-execution-ledger.ts`

Output:

```
--- Test 1: Missing decision is blocked ---
Result: status=blocked_no_decision, executed=false, reason=no approval decision recorded
[VERIFIED] Action did not run without a recorded decision.

--- Test 2: Rejected decision is blocked ---
Result: status=blocked_rejected, executed=false, reason=rejected by reviewer-risk: beneficiary details incomplete
[VERIFIED] Rejected approval never reached side effects.

--- Test 3: Approved decision executes once ---
Result: status=executed, executed=true, execution_id=exec-appr-approved, reason=approved by reviewer-ops: destination and amount verified
[VERIFIED] Approved action executed exactly once on first call.

--- Test 4: Retry replay does not execute again ---
Result: status=duplicate_replay, executed=false, execution_id=exec-appr-approved, reason=already executed for this approval id
[VERIFIED] Duplicate replay reused the original execution id with no new side effect.

--- Test 5: Different approval id can execute independently ---
Result: status=executed, executed=true, execution_id=exec-appr-approved-2, reason=approved by reviewer-ops: second transfer approved
[VERIFIED] A new approval id created one new execution as expected.
```

Checks run:

- `cd apps/web && npx oxfmt --check src/agents/approval-execution-ledger.ts` -> pass
- `cd apps/web && npx oxlint src/agents/approval-execution-ledger.ts` -> pass

Type-check note:

- Full `tsc --noEmit` was blocked in this run because local `node_modules` are not installed in `apps/web` (`@types/node` missing).