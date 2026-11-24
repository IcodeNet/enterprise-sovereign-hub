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


# A simulated durable state store: a plain dict standing in for what a real
# deployment would persist to Postgres via a durable-execution engine (DBOS,
# Temporal). The IMPORTANT property this simulates is that the pending
# action survives independently of the agent call that created it - a
# human can inspect and change `status` on their own schedule, without the
# original agent run needing to stay alive waiting for them.
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


# A tool the agent can call when it decides an action needs sign-off. This
# tool doesn't actually block and wait for a human - it records the request
# and returns immediately, reporting whatever the CURRENT status happens to
# be. The real human-in-the-loop pattern is the workflow calling the agent
# again later, once a human has actually updated that status.
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


# Runs the three-phase demonstration: the agent requests approval and
# necessarily pauses (Phase 1), a human approves out-of-band (Phase 2, no
# AI call at all - this is a human editing shared state directly), then the
# agent is invoked AGAIN with a fresh prompt telling it the state has
# changed (Phase 3) - a second, independent AI call, not a resumed one.
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
