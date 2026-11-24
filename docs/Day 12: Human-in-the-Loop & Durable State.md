Day 12 is about letting an AI-driven workflow pause safely for a human decision, without losing state or accidentally re-asking the same question forever.

---

## Durable Execution — Day 12: Human-in-the-Loop & Durable State

### The Problem We're Solving

Some actions - spending real money, deploying to production, committing a database change - shouldn't happen just because an AI decided to do them. They need a human to actually look and say yes. But an in-memory script that just "waits" for that yes has a real problem: if the process crashes, restarts, or the human takes an hour to respond, everything about the pending request is gone.

Durable execution solves this by separating "the AI decided this needs approval" from "a human said yes" into two completely different moments in time, connected only through state that's saved somewhere durable (a real deployment would use Postgres via a durable-execution engine; this lesson simulates that with an in-memory store, so the PATTERN is what matters here, not the storage). The AI's tool call records the request and returns immediately - it does NOT block waiting for a human. Later, entirely independently, a human updates that same stored record. A second, completely separate AI call then checks the updated state and proceeds.

Focus: a human-approval checkpoint that survives independently of the AI call that created it
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/workflows/`, create:
`durable_approval_agent.py`

### Step 3: Add the Source Code

```python
import asyncio
from enum import Enum

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

load_dotenv()


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ActionPayload(BaseModel):
    target_action: str = Field(description="The action requested by the agent.")
    estimated_cost_gbp: float = Field(description="Estimated operational cost in GBP.")
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING)


class ExecutionResult(BaseModel):
    action: str
    is_executed: bool
    summary: str


DURABLE_STATE_STORE: dict[str, ActionPayload] = {}


governance_agent = Agent(
    "openai:gpt-4o",
    deps_type=None,
    output_type=ExecutionResult,
    system_prompt=(
        "We are an enterprise AI governance agent. "
        "Any action costing over £50 must request human approval via the tool before executing."
    ),
)


@governance_agent.tool
async def request_human_approval(ctx: RunContext[None], action: str, cost: float) -> str:
    """Requests explicit human authorization for high-impact enterprise actions."""
    task_id = "task_001_deploy_pipeline"

    # Reuse the existing payload's status if this task was already
    # recorded - otherwise calling this tool a second time (e.g. once
    # execution actually resumes) would silently reset an already-approved
    # action back to PENDING, discarding the human's decision.
    payload = DURABLE_STATE_STORE.get(task_id) or ActionPayload(target_action=action, estimated_cost_gbp=cost)
    DURABLE_STATE_STORE[task_id] = payload

    print(f"\n  [CHECKPOINT CREATED] Task '{task_id}' requires approval for action: '{action}' (£{cost:.2f})")

    if payload.status == ApprovalStatus.APPROVED:
        return "APPROVAL_GRANTED: Action authorized by administrator."
    elif payload.status == ApprovalStatus.REJECTED:
        return "APPROVAL_DENIED: Action blocked by administrator."
    else:
        return "ACTION_PAUSED: Pending human review in governance portal."


async def run_durable_workflow():
    prompt = "Deploy our new AI model fine-tuning job which costs £120.00."

    print("--- Phase 1: Initial Agent Execution ---")
    result_phase1 = await governance_agent.run(prompt)
    print(f"Phase 1 Output: {result_phase1.output.summary}")

    print("\n--- Phase 2: Human Operator Intervenes ---")
    task_id = "task_001_deploy_pipeline"
    if task_id in DURABLE_STATE_STORE:
        print(f"Human Operator inspecting task: {DURABLE_STATE_STORE[task_id].target_action}")
        DURABLE_STATE_STORE[task_id].status = ApprovalStatus.APPROVED
        print(f"Human Operator updated status to: {DURABLE_STATE_STORE[task_id].status.value}")

    print("\n--- Phase 3: Resuming Workflow with Approved State ---")
    result_phase2 = await governance_agent.run(
        "Human approval status is now APPROVED. Proceed with execution.",
    )

    print(f"Phase 2 Output: {result_phase2.output.summary}")
    print(f"Final Action Executed: {result_phase2.output.is_executed}")


if __name__ == "__main__":
    asyncio.run(run_durable_workflow())
```

### Step 4: Run and Verify

```bash
python src/workflows/durable_approval_agent.py
```

A real run showed the full three-phase flow work correctly: Phase 1 paused with "Deployment paused awaiting human approval," Phase 2 (no AI call - just a human editing the stored record) flipped the status to APPROVED, and Phase 3's independent AI call returned `Final Action Executed: True`.

### A Real Bug This Lesson's Own Code Had

Creating a **brand-new** `ActionPayload` (defaulting to `PENDING`) every time `request_human_approval` is called, with no check for an existing record, is a real easy-to-miss bug. If the AI calls the approval tool again during Phase 3 - which it can do, since the tool is still available - the fresh `PENDING` payload silently overwrites the human's actual approval, and the workflow appears stuck in an infinite "still pending" loop with no visible error. The fix is to read the existing record first and only fall back to a new `PENDING` one if nothing is stored yet. Verified by running Phase 3 repeatedly and confirming the checkpoint log, once created, always resolves correctly on the second pass.

---

## Best Practices

- **A tool that records a pending state must not silently reset an already-decided one.** Check for an existing record before creating a fresh default - the bug above only shows up when the tool happens to be called more than once for the same task, which won't happen on every single run, making it easy to miss on a lucky test.
- **Phase 2 - the actual human decision - should never be an AI call.** In this lesson it's a plain dictionary write, and that's deliberate: the durability guarantee only holds if the human's decision is a real, independent, out-of-band update to shared state, not something routed back through the AI.
- **Treat "resuming" as a second, independent AI call, not a paused-and-continued one.** `governance_agent.run(...)` in Phase 3 has no memory of Phase 1's conversation - it only knows what the durable state store and its new prompt tell it, which is the entire point: state survives in the STORE, not in the AI call's own memory.

## Why This Matters in Production

Any pipeline that spends real money, deploys real infrastructure, or commits real data changes needs a genuine human checkpoint that survives a crash, a slow reviewer, or a server restart - not a script sitting in a blocking loop hoping nothing goes wrong while it waits. This pattern, and the real bug caught while testing it, both matter: the pattern gives us the safety, and the bug is exactly the kind of subtle state-management mistake that would otherwise surface for the first time in a real incident.
