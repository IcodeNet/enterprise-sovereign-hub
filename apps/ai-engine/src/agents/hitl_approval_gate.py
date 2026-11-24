"""Human-in-the-loop approval checkpoint for high-risk tool calls - Day 39.

Low-risk actions (search, formatting, summarization) should run
autonomously. High-risk actions (database migrations, cloud provisioning,
payments) must pause and wait for an explicit human decision before
executing - using an asyncio.Future as the actual pause/resume mechanism.
"""

import asyncio
import uuid
from enum import Enum
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


class ActionRiskTier(str, Enum):
    LOW = "LOW"
    HIGH = "HIGH"


class ToolExecutionProposal(BaseModel):
    action_id: str
    target_tool: str
    arguments: dict[str, Any]
    risk_tier: ActionRiskTier
    rationale: str


class HITLApprovalDecision(BaseModel):
    is_approved: bool
    reviewer_notes: str


class ApprovalCheckpointRegistry:
    def __init__(self):
        self._pending_checkpoints: dict[str, asyncio.Future] = {}

    def register_checkpoint(self, action_id: str) -> asyncio.Future:
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending_checkpoints[action_id] = future
        return future

    def resolve_checkpoint(self, action_id: str, decision: HITLApprovalDecision) -> None:
        if action_id in self._pending_checkpoints:
            future = self._pending_checkpoints.pop(action_id)
            if not future.done():
                future.set_result(decision)
                print(f" [CHECKPOINT RESOLVED] Action {action_id} marked as Approved={decision.is_approved}")


registry = ApprovalCheckpointRegistry()


async def execute_database_migration(migration_name: str) -> str:
    return f"DATABASE MIGRATION COMPLETED: Successfully applied schema '{migration_name}'."


async def request_guarded_execution(proposal: ToolExecutionProposal) -> str:
    print(f"\n[ACTION PROPOSED] Tool: '{proposal.target_tool}' | Risk Tier: {proposal.risk_tier.value}")
    print(f"Rationale: {proposal.rationale}")

    if proposal.risk_tier == ActionRiskTier.LOW:
        print(" [AUTO-APPROVED] Low-risk action executed automatically.")
        return "Executed low-risk action."

    print(f" >>> [SUSPENDED] High-risk action requires human authorization. Action ID: {proposal.action_id}")
    approval_future = registry.register_checkpoint(proposal.action_id)

    # Wait asynchronously until a human reviewer submits a decision - the
    # coroutine genuinely suspends here without blocking the event loop, so
    # other work (including the "human" resolving it) can run concurrently.
    decision: HITLApprovalDecision = await approval_future

    if not decision.is_approved:
        print(f" [BLOCKED] Action rejected by human reviewer. Reason: {decision.reviewer_notes}")
        return f"Execution rejected by reviewer: {decision.reviewer_notes}"

    print(f" [APPROVED] Reviewer confirmed action. Executing tool '{proposal.target_tool}'...")
    if proposal.target_tool == "execute_database_migration":
        return await execute_database_migration(**proposal.arguments)
    return "Action completed successfully."


async def run_hitl_workflow() -> None:
    action_id = str(uuid.uuid4())[:8]

    dangerous_proposal = ToolExecutionProposal(
        action_id=action_id,
        target_tool="execute_database_migration",
        arguments={"migration_name": "drop_legacy_auth_tokens_v2"},
        risk_tier=ActionRiskTier.HIGH,
        rationale="Remove obsolete authentication records to ensure compliance.",
    )

    # Dispatch the agent's request as a background task so it can suspend
    # on the approval future while this coroutine continues independently.
    task = asyncio.create_task(request_guarded_execution(dangerous_proposal))

    # Simulate a human reviewer inspecting and approving the action after a
    # real delay - proving the workflow genuinely pauses rather than racing.
    await asyncio.sleep(1.5)
    print(f"\n[HUMAN OPERATOR INTERVENTION] Reviewing pending action: {action_id}...")

    lead_review = HITLApprovalDecision(
        is_approved=True,
        reviewer_notes="Schema reviewed and verified against staging database. Approved for production.",
    )
    registry.resolve_checkpoint(action_id, lead_review)

    result = await task
    print(f"\nWorkflow Outcome:\n{result}")

    # Second scenario: prove the REJECT path also genuinely works, not just
    # the approve path - a gate that only ever approves isn't a real gate.
    print("\n--- Second Scenario: Human Rejects the Action ---")
    action_id_2 = str(uuid.uuid4())[:8]
    risky_proposal_2 = ToolExecutionProposal(
        action_id=action_id_2,
        target_tool="execute_database_migration",
        arguments={"migration_name": "drop_production_customers_table"},
        risk_tier=ActionRiskTier.HIGH,
        rationale="Attempting an unreviewed destructive migration.",
    )
    task2 = asyncio.create_task(request_guarded_execution(risky_proposal_2))
    await asyncio.sleep(1.0)
    registry.resolve_checkpoint(
        action_id_2,
        HITLApprovalDecision(is_approved=False, reviewer_notes="Destructive migration with no rollback plan - rejected."),
    )
    result2 = await task2
    print(f"\nWorkflow Outcome:\n{result2}")


if __name__ == "__main__":
    asyncio.run(run_hitl_workflow())
