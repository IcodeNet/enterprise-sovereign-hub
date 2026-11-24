Day 39 gives a high-risk tool call a genuine pause: the coroutine suspends waiting for a human decision, and only resumes once that decision actually arrives - proven both for approve AND reject.

---

## Agent Governance — Day 39: Human-in-the-Loop (HITL) Approval Checkpoints

### The Problem We're Solving

Low-risk agent actions (read-only search, formatting, summarization) should run autonomously. High-risk actions (database migrations, cloud provisioning, payments) need a human to explicitly say yes first. The tricky part is doing this WITHOUT the agent's coroutine blocking the whole event loop while it waits - and without silently defaulting to "approved" if the wait mechanism has a bug.

Focus: an `asyncio.Future`-based checkpoint that genuinely suspends a coroutine until an independent human decision resolves it
Time investment: 15 minutes

Attribution note:
- This lesson applies principles from Sam Bhagwat's "Principles of Building AI Agents" and pattern framing from "Patterns for Building AI Agents" (Sam Bhagwat and Michelle Gienow, mastra.ai): make risky actions explicit, keep approval boundaries clear, and verify runtime behavior with real evidence.

### Step 1: Build the Checkpoint Registry

`apps/ai-engine/src/agents/hitl_approval_gate.py` uses `asyncio.Future` as the actual suspend/resume primitive - `register_checkpoint()` creates a future tied to an action ID, and the agent's coroutine `await`s it directly:

```python
async def request_guarded_execution(proposal: ToolExecutionProposal) -> str:
    if proposal.risk_tier == ActionRiskTier.LOW:
        return "Executed low-risk action."

    approval_future = registry.register_checkpoint(proposal.action_id)
    decision: HITLApprovalDecision = await approval_future  # genuinely suspends here
    ...
```

A completely separate part of the program calls `resolve_checkpoint()` later, with no coupling to the waiting coroutine beyond the shared action ID.

### Step 2: Prove BOTH the Approve AND Reject Paths, Not Just the Happy One

A gate that's only ever tested with an approval looks identical to a gate with no real rejection logic at all. Extended the source's own demo (which only tested approval) with a second scenario where the human explicitly rejects the action.

### Step 3: Run and Verify

```
[ACTION PROPOSED] Tool: 'execute_database_migration' | Risk Tier: HIGH
Rationale: Remove obsolete authentication records to ensure compliance.
 >>> [SUSPENDED] High-risk action requires human authorization. Action ID: 26a5f037

[HUMAN OPERATOR INTERVENTION] Reviewing pending action: 26a5f037...
 [CHECKPOINT RESOLVED] Action 26a5f037 marked as Approved=True
 [APPROVED] Reviewer confirmed action. Executing tool 'execute_database_migration'...

Workflow Outcome:
DATABASE MIGRATION COMPLETED: Successfully applied schema 'drop_legacy_auth_tokens_v2'.

--- Second Scenario: Human Rejects the Action ---

[ACTION PROPOSED] Tool: 'execute_database_migration' | Risk Tier: HIGH
Rationale: Attempting an unreviewed destructive migration.
 >>> [SUSPENDED] High-risk action requires human authorization. Action ID: 2ecd5539
 [CHECKPOINT RESOLVED] Action 2ecd5539 marked as Approved=False
 [BLOCKED] Action rejected by human reviewer. Reason: Destructive migration with no rollback plan - rejected.

Workflow Outcome:
Execution rejected by reviewer: Destructive migration with no rollback plan - rejected.
```

Real proof both branches genuinely work: the migration only actually executed AFTER the approval future resolved (not before, not by default), and the second scenario's rejection genuinely stopped the destructive migration from running at all.

---

## Best Practices

- **Test the REJECT path with the same rigor as the approve path.** A checkpoint that's only ever exercised with an approval could have a silent bug that makes rejection a no-op (e.g. the tool executes anyway) - this only surfaces if you actually test it.
- **Use a real suspend primitive (`asyncio.Future`), not a polling loop, for the wait.** Polling (`while not resolved: await asyncio.sleep(0.1)`) would work but wastes cycles and adds latency; a future resolves the instant `resolve_checkpoint()` is called, with zero polling overhead.
- **Pop the pending checkpoint from the registry once resolved.** Leaving resolved-but-not-removed entries in `_pending_checkpoints` would grow unbounded over a long-running process's lifetime - a real memory-leak-shaped bug for a service handling many approval requests over time.

## Why This Matters in Production

An approval gate that can't be proven to actually block a rejected action is worse than no gate at all - it gives a false sense of safety. Testing both branches with real evidence (the destructive migration genuinely never ran in the reject scenario) is what turns "we built an approval gate" into "we verified an approval gate actually gates."
