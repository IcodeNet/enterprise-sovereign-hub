Day 47 lets an agent notice its own tool-call mistake and retry with corrected arguments automatically, and catches a real, consistently reproducible bug where the corrected retry succeeds but the final structured answer reports the wrong number.

---

## Resilience & Self-Correction — Day 47: Self-Healing Dynamic Tool Correction

### The Problem We're Solving

A standard tool that raises a normal exception on invalid arguments halts the whole agent run - the caller sees a crash, not a graceful recovery. Pydantic AI's `ModelRetry` exception is different: raising it inside a tool feeds the error message back into the model's own context as a correction prompt, and the model gets to notice its own mistake and retry the tool call with fixed arguments on its own next turn - no separate correction agent, no exception handling in the caller.

This is a genuinely different mechanism than Day 27's sandboxed-exec retry loop: that day retries GENERATED CODE against a sandbox; this day retries a REAL, already-defined tool call against live validation logic.

Focus: `ModelRetry` self-correction on tool arguments, with a direct verification the correction mechanism actually fires
Time investment: 15 minutes

### Step 1: Build the Tool with Strict Validation

`apps/ai-engine/src/agents/self_healing_tool_agent.py` defines `fetch_account_ledger`, which requires account IDs in a strict `ACC-XXXX` format. Given a malformed ID (e.g. `' acc-4081 '` - lowercase, padded with whitespace), it raises `ModelRetry` with guidance on the correct format instead of crashing:

```python
if not clean_id.startswith("ACC-") or len(clean_id) != 8 or not clean_id[4:].isdigit():
    raise ModelRetry(
        f"Invalid account ID format: '{raw_account_id}'. "
        "The ID must strictly match 'ACC-XXXX' with exactly 4 digits (e.g. 'ACC-4081'). "
        "Please normalize the ID and try again."
    )
```

### Step 2: Verify the Retry Mechanism Directly, Not Just the Final Answer

Beyond running the full agent and checking its final answer, calling the raw tool function directly with a deliberately bad ID confirms `ModelRetry` genuinely fires with the exact guidance text - proof of the mechanism itself, independent of whatever the model does with it.

### Step 3: Run and Verify - A Real, Reproducible Bug Found

```
Submitting query: Please pull the balance for customer ledger account ' acc-4081 '.

=== Execution Verified & Self-Healed ===
Target Account: ACC-4081
Retrieved Balance: £0.00
Audit Log: Failed to retrieve balance due to incorrect account ID format, which has been adjusted.

[VERIFIED] ModelRetry raised as expected: Invalid account ID format: 'not-a-valid-id'. ...
```

The account-ID correction itself works correctly - `ACC-4081` is the right normalized ID. But the retrieved balance is wrong: the tool's SECOND call (after correction) genuinely returns `124500.50`, confirmed by calling the agent directly with an already-correctly-formatted ID (which returns the right value with no correction needed at all). Re-ran the malformed-ID case 3 more times to rule out a one-off model slip - **all 4 runs consistently reported `£0.00` for the balance after a correction, while the direct no-correction-needed case consistently reported the real `124500.50`.**

The likely mechanism: once the model has seen its OWN prior tool call fail with an error, it appears to lose track of the numeric return value from the tool call that actually succeeded, and fabricates a plausible-looking `0.0` instead of reading the real result back out of its own tool-call history.

---

## Best Practices

- **Verify the mechanism directly (calling the tool function itself with bad input), not just the agent's polished final answer.** The final answer LOOKS successful (the audit log text sounds confident and specific), but only checking it against a known-good baseline (the no-correction-needed direct call) revealed the retrieved number was wrong.
- **A model correction that appears to work is not the same as one that's verified to work.** `ModelRetry`'s account-ID correction is real and works correctly - the account ID normalization genuinely succeeds. It's the SEPARATE step of reporting the tool's return value in the final structured output that silently breaks after a retry occurred. Don't let one correctly-working piece launder confidence into a different, unverified piece.
- **Re-run a suspicious result before reporting it as a finding, but also don't stop after the FIRST clean-looking run either.** 4 total runs (1 direct + 3 more) were needed to be confident this is a consistent bug, not model noise.

## Why This Matters in Production

Self-healing tool correction is a genuinely powerful pattern, but "the agent recovered from the error" and "the agent's final answer is correct" are two different claims that need two different checks. This day's real finding - a consistently reproducible silent-zero-balance bug that survives 4 separate runs - is exactly the kind of thing that would ship silently in a system that only checks "did the agent stop erroring," never "is the number in the final answer actually right."
