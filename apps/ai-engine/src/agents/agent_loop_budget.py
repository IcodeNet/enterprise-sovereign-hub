"""Bounded agent loop budget with per-step authority checks - Day 63.

Goal: prevent runaway autonomous loops by enforcing max steps and tool authority
at each step.
"""

from dataclasses import dataclass
from enum import Enum


class LoopStatus(str, Enum):
    COMPLETED = "completed"
    BUDGET_EXHAUSTED = "budget_exhausted"
    AUTHORITY_DENIED = "authority_denied"


@dataclass(frozen=True)
class LoopEvent:
    step: int
    tool: str
    outcome: str


@dataclass(frozen=True)
class LoopOutcome:
    request_id: str
    intent: str
    status: LoopStatus
    steps_executed: int
    max_steps: int
    events: tuple[LoopEvent, ...]
    stopped_reason: str


TOOL_AUTHORITY: dict[str, set[str]] = {
    "faq": {"retrieval_lookup", "policy_summary"},
    "account_data": {"auth_check", "account_lookup"},
    "simulation": {"auth_check", "account_lookup", "projection_calc"},
}


def is_allowed(intent: str, tool: str) -> bool:
    return tool in TOOL_AUTHORITY.get(intent, set())


def execute_tool(tool: str) -> str:
    return f"ok:{tool}"


def run_bounded_loop(
    request_id: str,
    intent: str,
    planned_tools: list[str],
    max_steps: int,
) -> LoopOutcome:
    events: list[LoopEvent] = []
    executed_steps = 0

    for index, tool in enumerate(planned_tools):
        step = index + 1
        if step > max_steps:
            return LoopOutcome(
                request_id=request_id,
                intent=intent,
                status=LoopStatus.BUDGET_EXHAUSTED,
                steps_executed=executed_steps,
                max_steps=max_steps,
                events=tuple(events),
                stopped_reason=f"max_steps={max_steps} reached before {tool}",
            )

        if not is_allowed(intent, tool):
            events.append(LoopEvent(step=step, tool=tool, outcome="denied"))
            return LoopOutcome(
                request_id=request_id,
                intent=intent,
                status=LoopStatus.AUTHORITY_DENIED,
                steps_executed=executed_steps,
                max_steps=max_steps,
                events=tuple(events),
                stopped_reason=f"tool_not_allowed:{tool}",
            )

        result = execute_tool(tool)
        events.append(LoopEvent(step=step, tool=tool, outcome=result))
        executed_steps += 1

    return LoopOutcome(
        request_id=request_id,
        intent=intent,
        status=LoopStatus.COMPLETED,
        steps_executed=executed_steps,
        max_steps=max_steps,
        events=tuple(events),
        stopped_reason="completed",
    )


def main() -> None:
    print("--- Test 1: Completed inside budget ---")
    t1 = run_bounded_loop(
        request_id="req-6301",
        intent="simulation",
        planned_tools=["auth_check", "projection_calc"],
        max_steps=3,
    )
    print(
        "Result: "
        f"status={t1.status}, steps_executed={t1.steps_executed}/{t1.max_steps}, "
        f"reason={t1.stopped_reason}"
    )
    assert t1.status == LoopStatus.COMPLETED
    assert t1.steps_executed == 2
    print("[VERIFIED] Loop completed before budget and only allowed tools ran.")

    print("\n--- Test 2: Budget stops runaway plan ---")
    t2 = run_bounded_loop(
        request_id="req-6302",
        intent="simulation",
        planned_tools=["auth_check", "account_lookup", "projection_calc", "projection_calc"],
        max_steps=3,
    )
    print(
        "Result: "
        f"status={t2.status}, steps_executed={t2.steps_executed}/{t2.max_steps}, "
        f"reason={t2.stopped_reason}"
    )
    assert t2.status == LoopStatus.BUDGET_EXHAUSTED
    assert t2.steps_executed == 3
    print("[VERIFIED] Fourth step was blocked by max_steps before execution.")

    print("\n--- Test 3: Authority denies disallowed tool mid-loop ---")
    t3 = run_bounded_loop(
        request_id="req-6303",
        intent="faq",
        planned_tools=["retrieval_lookup", "account_lookup"],
        max_steps=3,
    )
    print(
        "Result: "
        f"status={t3.status}, steps_executed={t3.steps_executed}/{t3.max_steps}, "
        f"reason={t3.stopped_reason}"
    )
    assert t3.status == LoopStatus.AUTHORITY_DENIED
    assert t3.steps_executed == 1
    assert t3.events[-1].outcome == "denied"
    print("[VERIFIED] Disallowed tool was denied at the exact step it appeared.")

    print("\n--- Test 4: Empty plan ends cleanly ---")
    t4 = run_bounded_loop(
        request_id="req-6304",
        intent="faq",
        planned_tools=[],
        max_steps=3,
    )
    print(
        "Result: "
        f"status={t4.status}, steps_executed={t4.steps_executed}/{t4.max_steps}, "
        f"reason={t4.stopped_reason}"
    )
    assert t4.status == LoopStatus.COMPLETED
    assert t4.steps_executed == 0
    print("[VERIFIED] Empty plan returns completed with zero steps.")


if __name__ == "__main__":
    main()
