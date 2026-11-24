Day 60 adds a deterministic human-in-the-loop gate that blocks high-risk actions until a reviewer explicitly approves or rejects them.

---

## Resilience & Safety — Day 60: Human-in-the-Loop Gate for High-Risk Actions

### The Problem We're Solving

Retry controls (Days 58-59) tell us how to handle failure and evaluator state, but they do not answer a separate control-plane question: who is allowed to execute a high-risk action.

Without an explicit gate, an agent can execute risky operations directly from model output. That is unacceptable for production flows where side effects matter.

This day builds a deterministic gate policy:

- low risk + high confidence -> auto-approve,
- low risk + very low confidence -> auto-reject,
- high risk -> require human decision,
- human rejection -> block execution.

Focus: explicit human authorization for high-risk actions
Time investment: 15 minutes

### Step 1: Build the Gate

`apps/ai-engine/src/agents/human_in_the_loop_gate.py` defines:

- `requires_human_review()` for deterministic escalation,
- `evaluate_gate()` for decision outcomes,
- typed outcomes (`AUTO_APPROVED`, `AUTO_REJECTED`, `PENDING_REVIEW`, `HUMAN_APPROVED`, `HUMAN_REJECTED`).

### Step 2: Prove 5 Cases

1. low risk, high confidence -> auto-approved.
2. low risk, very low confidence -> auto-rejected.
3. high risk, no reviewer decision -> pending review.
4. high risk, reviewer approved -> executes.
5. high risk, reviewer rejected -> blocked.

### Step 3: Run and Verify — Real Output

Command:

`python apps/ai-engine/src/agents/human_in_the_loop_gate.py`

Output:

```
--- Test 1: Low risk + high confidence auto-approves ---
Result: status=auto_approved, executed=True, reason=low risk and high confidence
[VERIFIED] Deterministic low-risk path approved with no human step.

--- Test 2: Low risk + very low confidence auto-rejects ---
Result: status=auto_rejected, executed=False, reason=low risk but confidence too low
[VERIFIED] Low-confidence path was blocked before execution.

--- Test 3: High risk with no reviewer stays pending ---
Result: status=pending_review, executed=False, reason=human approval required
[VERIFIED] High-risk action halted until a human decision exists.

--- Test 4: High risk + reviewer approval executes ---
Result: status=human_approved, executed=True, reason=approved by reviewer-ops: destination verified
[VERIFIED] Human-approved high-risk action executed.

--- Test 5: High risk + reviewer rejection blocks execution ---
Result: status=human_rejected, executed=False, reason=rejected by reviewer-risk: missing beneficiary proof
[VERIFIED] Human rejection prevented side effects.
```

Additional check run:

- `python -m py_compile apps/ai-engine/src/agents/human_in_the_loop_gate.py` -> pass

## Best Practices

- Keep risk routing deterministic before any side effect.
- Make "pending review" an explicit machine state, not implicit waiting logic.
- Return reviewer-attributed reasons for approved/rejected outcomes.

## Why This Matters in Production

This gives Eunomia and Skill Reporter an auditable action boundary: models can propose high-risk actions, but only explicit human approval can execute them.