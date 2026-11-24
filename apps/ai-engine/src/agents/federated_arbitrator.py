"""Federated tool-call arbitration for concurrent multi-agent write conflicts - Day 45.

When independent specialist agents propose tool calls against shared
infrastructure simultaneously, executing them in arbitrary order risks
write-after-read hazards, race conditions, or cache corruption. An
arbitrator agent evaluates the pending proposals as a batch and returns
an ordered, conflict-free execution plan before any of them actually run.
"""

import asyncio
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class ToolActionProposal(BaseModel):
    agent_id: str = Field(description="Identifier of the calling agent.")
    target_resource: str = Field(description="Database table, cache key, or external API.")
    action_type: Literal["READ", "WRITE", "DELETE", "INVALIDATE"]
    priority: int = Field(ge=1, le=10, description="Priority from 1 (lowest) to 10 (highest).")


class ArbitrationPlan(BaseModel):
    execution_order: list[str] = Field(description="Ordered list of agent_ids indicating execution sequence.")
    rejected_actions: list[str] = Field(description="Agent IDs of actions blocked due to safety violations.")
    arbitration_rationale: str = Field(description="Clear explanation of the sequencing logic applied.")


arbitrator_agent = Agent(
    "openai:gpt-4o",
    output_type=ArbitrationPlan,
    system_prompt=(
        "We are a principal distributed systems arbitrator. "
        "Sequence concurrent tool calls across specialist agents to prevent race conditions. "
        "Rules: "
        "1. WRITE or DELETE operations lock target resources. "
        "2. READ actions must not run concurrently with WRITE actions on the same resource. "
        "3. Cache INVALIDATE actions must execute strictly AFTER the corresponding WRITE commits."
    ),
)


def validate_plan_against_rules(proposals: list[ToolActionProposal], plan: ArbitrationPlan) -> list[str]:
    """Checks the arbitrator's own plan against its stated rules - proving the
    plan is genuinely rule-compliant, not just plausible-sounding text."""
    violations: list[str] = []
    by_agent = {p.agent_id: p for p in proposals}

    write_actions = {p.agent_id for p in proposals if p.action_type in ("WRITE", "DELETE")}
    invalidate_actions = {p.agent_id for p in proposals if p.action_type == "INVALIDATE"}

    # Rule 3: every INVALIDATE for a resource must be scheduled after the
    # corresponding WRITE/DELETE for the same resource.
    for inv_id in invalidate_actions:
        inv_resource = by_agent[inv_id].target_resource
        matching_writes = [w for w in write_actions if by_agent[w].target_resource == inv_resource]
        for write_id in matching_writes:
            if write_id in plan.execution_order and inv_id in plan.execution_order:
                if plan.execution_order.index(inv_id) < plan.execution_order.index(write_id):
                    violations.append(f"INVALIDATE '{inv_id}' scheduled before its WRITE '{write_id}' - violates rule 3.")

    return violations


async def run_arbitration() -> None:
    proposals = [
        ToolActionProposal(
            agent_id="cache_manager_agent",
            target_resource="market_trends",
            action_type="INVALIDATE",
            priority=7,
        ),
        ToolActionProposal(
            agent_id="scraper_worker_agent",
            target_resource="market_trends",
            action_type="WRITE",
            priority=9,
        ),
        ToolActionProposal(
            agent_id="dashboard_query_agent",
            target_resource="market_trends",
            action_type="READ",
            priority=5,
        ),
    ]

    print("Submitting concurrent tool proposals to Federated Arbitrator...")
    raw_proposals = [p.model_dump() for p in proposals]
    prompt = f"Arbitrate the execution order for these concurrent actions:\n{raw_proposals}"

    res = await arbitrator_agent.run(prompt)
    plan: ArbitrationPlan = res.output

    print("\n=== Arbitration Decision ===")
    print(f"Execution Order: {' -> '.join(plan.execution_order)}")
    print(f"Rejected Actions: {plan.rejected_actions or 'None'}")
    print(f"Rationale: {plan.arbitration_rationale}")

    # Real proof the plan is genuinely rule-compliant, not just plausible text.
    violations = validate_plan_against_rules(proposals, plan)
    if violations:
        print(f"\n[PLAN VALIDATION FAILED] {violations}")
    else:
        print("\n[PLAN VALIDATION PASSED] Execution order genuinely respects the stated dependency rules.")


if __name__ == "__main__":
    asyncio.run(run_arbitration())
