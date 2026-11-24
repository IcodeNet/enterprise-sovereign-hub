Day 39's TypeScript port builds the same suspend/resume approval checkpoint using a Promise created with `Promise.withResolvers()` in place of Python's `asyncio.Future`, and verifies both the approve and reject paths identically.

---

## Agent Governance — Day 39 (TS Port): Human-in-the-Loop (HITL) Approval Checkpoints

### The Problem We're Solving

Same problem as the Python lesson: a high-risk action needs to genuinely pause and wait for an explicit human decision, without blocking the event loop and without silently defaulting to approved.

Focus: the same suspend/resume checkpoint, built with a Promise whose resolver is exposed externally
Time investment: 15 minutes

Attribution note:
- This lesson applies principles from Sam Bhagwat's "Principles of Building AI Agents" and pattern framing from "Patterns for Building AI Agents" (Sam Bhagwat and Michelle Gienow, mastra.ai): make risky actions explicit, keep approval boundaries clear, and verify runtime behavior with real evidence.

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the suspend primitive (`asyncio.Future`, `loop.create_future()`) | the suspend primitive (`Promise.withResolvers<HitlApprovalDecision>()`) |
| creating a pending checkpoint (`registry.register_checkpoint(action_id)`) | creating a pending checkpoint (`registry.registerCheckpoint(actionId)`) |
| genuinely suspending until resolved (`decision = await approval_future`) | genuinely suspending until resolved (`const decision = await approvalPromise`) |
| resolving it externally (`future.set_result(decision)`) | resolving it externally (`entry.resolve(decision)`) |
| the outcome shape (`class HITLApprovalDecision(BaseModel)`) | the outcome shape (`interface HitlApprovalDecision`) |

### Step 1: Build the Checkpoint Registry with `Promise.withResolvers()`

```typescript
registerCheckpoint(actionId: string): Promise<HitlApprovalDecision> {
  const { promise, resolve } = Promise.withResolvers<HitlApprovalDecision>();
  this.pendingCheckpoints.set(actionId, { promise, resolve, settled: false });
  return promise;
}
```

Same pattern already proven on Day 29's rate limiter and Day 35's circuit breaker mutex - `Promise.withResolvers()` gives an externally-resolvable promise without a manual executor-callback dance.

### Step 2: Run and Verify - Both Branches, Same Real Proof

```
[ACTION PROPOSED] Tool: 'execute_database_migration' | Risk Tier: HIGH
Rationale: Remove obsolete authentication records to ensure compliance.
 >>> [SUSPENDED] High-risk action requires human authorization. Action ID: 1053c826
[HUMAN OPERATOR INTERVENTION] Reviewing pending action: 1053c826...
 [CHECKPOINT RESOLVED] Action 1053c826 marked as Approved=true
 [APPROVED] Reviewer confirmed action. Executing tool 'execute_database_migration'...
Workflow Outcome:
DATABASE MIGRATION COMPLETED: Successfully applied schema 'drop_legacy_auth_tokens_v2'.

--- Second Scenario: Human Rejects the Action ---
[ACTION PROPOSED] Tool: 'execute_database_migration' | Risk Tier: HIGH
Rationale: Attempting an unreviewed destructive migration.
 >>> [SUSPENDED] High-risk action requires human authorization. Action ID: a032222a
 [CHECKPOINT RESOLVED] Action a032222a marked as Approved=false
 [BLOCKED] Action rejected by human reviewer. Reason: Destructive migration with no rollback plan - rejected.
Workflow Outcome:
Execution rejected by reviewer: Destructive migration with no rollback plan - rejected.
```

Identical real result shape to the Python side: the destructive migration in the reject scenario genuinely never ran. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **`Promise.withResolvers()` is a genuinely cleaner fit here than the older manual `new Promise((resolve) => { savedResolve = resolve })` pattern** - the resolver function is available immediately as a returned value rather than needing a variable captured from inside the executor callback, which is easy to get wrong under refactoring.
- **Mark a checkpoint `settled` and remove it from the map atomically with resolving it**, the same defensive discipline as Python's `if not future.done()` check - without this, a duplicate `resolveCheckpoint()` call for the same action ID (a retry, a race) could throw or silently double-resolve depending on the exact primitive used.

## Why This Port Matters in Production

Both languages now have a proven, externally-resolvable suspend primitive for exactly this kind of "pause a running task until an out-of-band decision arrives" pattern - Python's native `Future` and JS's `Promise.withResolvers()` play the identical role, and this is now the third day (after 29 and 35) this repo has reached for the same JS pattern, which is worth recognizing as this project's standard tool for the job rather than reinventing it each time.
