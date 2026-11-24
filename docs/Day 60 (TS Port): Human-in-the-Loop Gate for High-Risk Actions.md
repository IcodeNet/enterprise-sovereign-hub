TypeScript port of Day 60 with the same risk-routing and human-approval outcomes.

---

## Resilience & Safety — Day 60 (TS Port): Human-in-the-Loop Gate for High-Risk Actions

Implementation file:

- `apps/web/src/agents/human-in-the-loop-gate.ts`

Shared behavior with Python:

- deterministic low-risk auto-approve path,
- deterministic low-confidence auto-reject path,
- high-risk pending state until human decision,
- reviewer approval executes, reviewer rejection blocks.

### Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/human-in-the-loop-gate.ts`

Output:

```
--- Test 1: Low risk + high confidence auto-approves ---
Result: status=auto_approved, executed=true, reason=low risk and high confidence
[VERIFIED] Deterministic low-risk path approved with no human step.

--- Test 2: Low risk + very low confidence auto-rejects ---
Result: status=auto_rejected, executed=false, reason=low risk but confidence too low
[VERIFIED] Low-confidence path was blocked before execution.

--- Test 3: High risk with no reviewer stays pending ---
Result: status=pending_review, executed=false, reason=human approval required
[VERIFIED] High-risk action halted until a human decision exists.

--- Test 4: High risk + reviewer approval executes ---
Result: status=human_approved, executed=true, reason=approved by reviewer-ops: destination verified
[VERIFIED] Human-approved high-risk action executed.

--- Test 5: High risk + reviewer rejection blocks execution ---
Result: status=human_rejected, executed=false, reason=rejected by reviewer-risk: missing beneficiary proof
[VERIFIED] Human rejection prevented side effects.
```

Checks run:

- `cd apps/web && npx oxfmt --check src/agents/human-in-the-loop-gate.ts` -> pass
- `cd apps/web && npx oxlint src/agents/human-in-the-loop-gate.ts` -> pass

This keeps approval-gate behavior aligned between Python and TypeScript for identical risk and reviewer inputs.