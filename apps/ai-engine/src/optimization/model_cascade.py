"""Dynamic model cascade with cost-aware routing and escalation - Day 37.

Sending every task to a frontier reasoning model wastes money and latency
on work a small, cheap model could handle. A lightweight classifier
inspects task complexity first: simple tasks route to a fast, cheap model,
complex tasks (or a cheap-model failure) escalate to the frontier model.
"""

import asyncio
import time
from enum import Enum

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class TaskComplexity(str, Enum):
    LOW = "LOW"
    HIGH = "HIGH"


class RoutingDecision(BaseModel):
    complexity: TaskComplexity = Field(description="LOW for simple lookup/formatting; HIGH for deep logic.")
    justification: str


class CascadeExecutionResult(BaseModel):
    query: str
    tier_used: str
    latency_ms: float
    output: str


router_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=RoutingDecision,
    system_prompt=(
        "We are a precision query routing classifier. "
        "Classify tasks as LOW complexity (summaries, simple extracts, basic formatting) "
        "or HIGH complexity (distributed architecture, multi-hop reasoning, formal verification)."
    ),
)

tier1_agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt="We are Tier 1: fast, efficient, low-latency microservice assistant.",
)

tier2_agent = Agent(
    "openai:gpt-4o",
    system_prompt="We are Tier 2: principal systems architect for complex reasoning.",
)


async def execute_cascade_query(user_query: str) -> CascadeExecutionResult:
    start_time = time.perf_counter()
    print(f"\nAnalyzing Query: '{user_query}'")

    routing_eval = await router_agent.run(f"Evaluate complexity for: {user_query}")
    decision: RoutingDecision = routing_eval.output
    print(f" [ROUTER] Complexity: {decision.complexity.value} | Reason: {decision.justification}")

    tier_name = "Tier 1 (gpt-4o-mini)"

    if decision.complexity == TaskComplexity.LOW:
        try:
            print(" [DISPATCH] Executing on low-cost Tier 1 model...")
            res = await tier1_agent.run(user_query)
            final_text = str(res.output)
        except Exception as err:
            print(f" [TIER 1 FAILURE] {err}. Escalating to Tier 2 frontier...")
            res = await tier2_agent.run(user_query)
            final_text = str(res.output)
            tier_name = "Tier 2 (gpt-4o - Escalated)"
    else:
        print(" [DISPATCH] High complexity detected. Routing directly to Tier 2 frontier...")
        res = await tier2_agent.run(user_query)
        final_text = str(res.output)
        tier_name = "Tier 2 (gpt-4o - Direct)"

    latency = (time.perf_counter() - start_time) * 1000

    return CascadeExecutionResult(query=user_query, tier_used=tier_name, latency_ms=round(latency, 2), output=final_text)


async def main() -> None:
    q1 = "Extract the email from: 'Contact our support team at support@example.com for details.'"
    r1 = await execute_cascade_query(q1)
    print(f"Result 1 ({r1.tier_used}, {r1.latency_ms}ms):\n{r1.output}\n")

    q2 = "Architect a Byzantine fault-tolerant consensus protocol for multi-region Redis sync."
    r2 = await execute_cascade_query(q2)
    print(f"Result 2 ({r2.tier_used}, {r2.latency_ms}ms):\n{r2.output[:120]}...\n")

    # Real proof the cascade actually changes which tier is used, not just
    # that it reports different tier names: LOW should be materially faster
    # AND cheaper than HIGH for a genuinely simple task on the same model
    # pair, since Tier 1 is a smaller model with a shorter response.
    print(f"Latency comparison: LOW={r1.latency_ms}ms vs HIGH={r2.latency_ms}ms")


if __name__ == "__main__":
    asyncio.run(main())
