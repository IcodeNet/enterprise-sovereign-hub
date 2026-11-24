"""Idempotent approval execution ledger - Day 61.

Goal: once a high-risk action is approved, execute it at most once even when
clients retry the same request.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Callable


class ApprovalStatus(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class ExecuteStatus(str, Enum):
    EXECUTED = "executed"
    DUPLICATE_REPLAY = "duplicate_replay"
    BLOCKED_NO_DECISION = "blocked_no_decision"
    BLOCKED_REJECTED = "blocked_rejected"


@dataclass(frozen=True)
class ApprovalDecision:
    approval_id: str
    action_id: str
    status: ApprovalStatus
    reviewer: str
    note: str


@dataclass(frozen=True)
class ExecutionOutcome:
    status: ExecuteStatus
    executed: bool
    execution_id: str | None
    reason: str


class ApprovalExecutionLedger:
    def __init__(self) -> None:
        self._decisions: dict[str, ApprovalDecision] = {}
        self._executions: dict[str, str] = {}

    def record_decision(self, decision: ApprovalDecision) -> None:
        self._decisions[decision.approval_id] = decision

    def execute_if_approved(
        self, approval_id: str, *, side_effect: Callable[[], None]
    ) -> ExecutionOutcome:
        decision = self._decisions.get(approval_id)
        if decision is None:
            return ExecutionOutcome(
                status=ExecuteStatus.BLOCKED_NO_DECISION,
                executed=False,
                execution_id=None,
                reason="no approval decision recorded",
            )

        if decision.status == ApprovalStatus.REJECTED:
            return ExecutionOutcome(
                status=ExecuteStatus.BLOCKED_REJECTED,
                executed=False,
                execution_id=None,
                reason=f"rejected by {decision.reviewer}: {decision.note}",
            )

        existing_execution_id = self._executions.get(approval_id)
        if existing_execution_id is not None:
            return ExecutionOutcome(
                status=ExecuteStatus.DUPLICATE_REPLAY,
                executed=False,
                execution_id=existing_execution_id,
                reason="already executed for this approval id",
            )

        side_effect()
        execution_id = f"exec-{approval_id}"
        self._executions[approval_id] = execution_id
        return ExecutionOutcome(
            status=ExecuteStatus.EXECUTED,
            executed=True,
            execution_id=execution_id,
            reason=f"approved by {decision.reviewer}: {decision.note}",
        )


def main() -> None:
    ledger = ApprovalExecutionLedger()
    side_effect_calls = 0

    def run_payment_side_effect() -> None:
        nonlocal side_effect_calls
        side_effect_calls += 1

    print("--- Test 1: Missing decision is blocked ---")
    t1 = ledger.execute_if_approved("appr-missing", side_effect=run_payment_side_effect)
    print(f"Result: status={t1.status.value}, executed={t1.executed}, reason={t1.reason}")
    assert t1.status == ExecuteStatus.BLOCKED_NO_DECISION and side_effect_calls == 0
    print("[VERIFIED] Action did not run without a recorded decision.")

    print("\n--- Test 2: Rejected decision is blocked ---")
    ledger.record_decision(
        ApprovalDecision(
            approval_id="appr-rejected",
            action_id="wire-1001",
            status=ApprovalStatus.REJECTED,
            reviewer="reviewer-risk",
            note="beneficiary details incomplete",
        )
    )
    t2 = ledger.execute_if_approved("appr-rejected", side_effect=run_payment_side_effect)
    print(f"Result: status={t2.status.value}, executed={t2.executed}, reason={t2.reason}")
    assert t2.status == ExecuteStatus.BLOCKED_REJECTED and side_effect_calls == 0
    print("[VERIFIED] Rejected approval never reached side effects.")

    print("\n--- Test 3: Approved decision executes once ---")
    ledger.record_decision(
        ApprovalDecision(
            approval_id="appr-approved",
            action_id="wire-2001",
            status=ApprovalStatus.APPROVED,
            reviewer="reviewer-ops",
            note="destination and amount verified",
        )
    )
    t3 = ledger.execute_if_approved("appr-approved", side_effect=run_payment_side_effect)
    print(
        f"Result: status={t3.status.value}, executed={t3.executed}, "
        f"execution_id={t3.execution_id}, reason={t3.reason}"
    )
    assert t3.status == ExecuteStatus.EXECUTED and side_effect_calls == 1
    print("[VERIFIED] Approved action executed exactly once on first call.")

    print("\n--- Test 4: Retry replay does not execute again ---")
    t4 = ledger.execute_if_approved("appr-approved", side_effect=run_payment_side_effect)
    print(
        f"Result: status={t4.status.value}, executed={t4.executed}, "
        f"execution_id={t4.execution_id}, reason={t4.reason}"
    )
    assert (
        t4.status == ExecuteStatus.DUPLICATE_REPLAY
        and side_effect_calls == 1
        and t4.execution_id == t3.execution_id
    )
    print("[VERIFIED] Duplicate replay reused the original execution id with no new side effect.")

    print("\n--- Test 5: Different approval id can execute independently ---")
    ledger.record_decision(
        ApprovalDecision(
            approval_id="appr-approved-2",
            action_id="wire-2002",
            status=ApprovalStatus.APPROVED,
            reviewer="reviewer-ops",
            note="second transfer approved",
        )
    )
    t5 = ledger.execute_if_approved("appr-approved-2", side_effect=run_payment_side_effect)
    print(
        f"Result: status={t5.status.value}, executed={t5.executed}, "
        f"execution_id={t5.execution_id}, reason={t5.reason}"
    )
    assert t5.status == ExecuteStatus.EXECUTED and side_effect_calls == 2
    print("[VERIFIED] A new approval id created one new execution as expected.")


if __name__ == "__main__":
    main()
