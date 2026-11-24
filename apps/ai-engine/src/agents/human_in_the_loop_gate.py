"""Human-in-the-loop gate for high-risk actions - Day 60.

Goal: route risky operations through explicit human approval while keeping
low-risk decisions deterministic and auditable.
"""

from dataclasses import dataclass
from enum import Enum


class RiskTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GateStatus(str, Enum):
    AUTO_APPROVED = "auto_approved"
    AUTO_REJECTED = "auto_rejected"
    PENDING_REVIEW = "pending_review"
    HUMAN_APPROVED = "human_approved"
    HUMAN_REJECTED = "human_rejected"


@dataclass(frozen=True)
class ActionProposal:
    action_id: str
    action_name: str
    risk_tier: RiskTier
    confidence: float


@dataclass(frozen=True)
class ReviewerDecision:
    approved: bool
    reviewer: str
    note: str


@dataclass(frozen=True)
class GateOutcome:
    status: GateStatus
    executed: bool
    reason: str


def requires_human_review(proposal: ActionProposal) -> bool:
    if proposal.risk_tier == RiskTier.HIGH:
        return True
    if proposal.risk_tier == RiskTier.MEDIUM and proposal.confidence < 0.75:
        return True
    return False


def evaluate_gate(proposal: ActionProposal, reviewer: ReviewerDecision | None = None) -> GateOutcome:
    if proposal.risk_tier == RiskTier.LOW and proposal.confidence >= 0.7:
        return GateOutcome(
            status=GateStatus.AUTO_APPROVED,
            executed=True,
            reason="low risk and high confidence",
        )

    if proposal.risk_tier == RiskTier.LOW and proposal.confidence < 0.4:
        return GateOutcome(
            status=GateStatus.AUTO_REJECTED,
            executed=False,
            reason="low risk but confidence too low",
        )

    if requires_human_review(proposal):
        if reviewer is None:
            return GateOutcome(
                status=GateStatus.PENDING_REVIEW,
                executed=False,
                reason="human approval required",
            )
        if reviewer.approved:
            return GateOutcome(
                status=GateStatus.HUMAN_APPROVED,
                executed=True,
                reason=f"approved by {reviewer.reviewer}: {reviewer.note}",
            )
        return GateOutcome(
            status=GateStatus.HUMAN_REJECTED,
            executed=False,
            reason=f"rejected by {reviewer.reviewer}: {reviewer.note}",
        )

    return GateOutcome(
        status=GateStatus.AUTO_APPROVED,
        executed=True,
        reason="medium risk with sufficient confidence",
    )


def main() -> None:
    print("--- Test 1: Low risk + high confidence auto-approves ---")
    t1 = evaluate_gate(
        ActionProposal("a1", "show_product_list", RiskTier.LOW, confidence=0.89)
    )
    print(f"Result: status={t1.status.value}, executed={t1.executed}, reason={t1.reason}")
    assert t1.status == GateStatus.AUTO_APPROVED and t1.executed
    print("[VERIFIED] Deterministic low-risk path approved with no human step.")

    print("\n--- Test 2: Low risk + very low confidence auto-rejects ---")
    t2 = evaluate_gate(
        ActionProposal("a2", "show_product_list", RiskTier.LOW, confidence=0.31)
    )
    print(f"Result: status={t2.status.value}, executed={t2.executed}, reason={t2.reason}")
    assert t2.status == GateStatus.AUTO_REJECTED and not t2.executed
    print("[VERIFIED] Low-confidence path was blocked before execution.")

    print("\n--- Test 3: High risk with no reviewer stays pending ---")
    t3 = evaluate_gate(
        ActionProposal("a3", "submit_wire_transfer", RiskTier.HIGH, confidence=0.95)
    )
    print(f"Result: status={t3.status.value}, executed={t3.executed}, reason={t3.reason}")
    assert t3.status == GateStatus.PENDING_REVIEW and not t3.executed
    print("[VERIFIED] High-risk action halted until a human decision exists.")

    print("\n--- Test 4: High risk + reviewer approval executes ---")
    t4 = evaluate_gate(
        ActionProposal("a4", "submit_wire_transfer", RiskTier.HIGH, confidence=0.95),
        reviewer=ReviewerDecision(True, "reviewer-ops", "destination verified"),
    )
    print(f"Result: status={t4.status.value}, executed={t4.executed}, reason={t4.reason}")
    assert t4.status == GateStatus.HUMAN_APPROVED and t4.executed
    print("[VERIFIED] Human-approved high-risk action executed.")

    print("\n--- Test 5: High risk + reviewer rejection blocks execution ---")
    t5 = evaluate_gate(
        ActionProposal("a5", "submit_wire_transfer", RiskTier.HIGH, confidence=0.95),
        reviewer=ReviewerDecision(False, "reviewer-risk", "missing beneficiary proof"),
    )
    print(f"Result: status={t5.status.value}, executed={t5.executed}, reason={t5.reason}")
    assert t5.status == GateStatus.HUMAN_REJECTED and not t5.executed
    print("[VERIFIED] Human rejection prevented side effects.")


if __name__ == "__main__":
    main()
