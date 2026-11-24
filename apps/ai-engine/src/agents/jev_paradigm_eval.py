"""Day 64: Jev-style decision layer evaluation for Eunomia-style routing.

This is a deterministic in-repo approximation of a Jev-style decision layer.
It demonstrates typed routing + confidence gating mechanics. It does not call
an external Jev/System One API, and its confidence values are normalized
heuristic scores (not calibrated probabilities).
"""

from dataclasses import dataclass
from enum import Enum


class Intent(str, Enum):
    BALANCE = "balance"
    COVERAGE = "coverage"
    PRODUCTS = "products"
    FAQ = "faq"
    SIMULATION = "simulation"
    PORTFOLIO = "portfolio"
    UNKNOWN = "unknown"


class RiskTier(str, Enum):
    LOW = "low"
    HIGH = "high"


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    message: str
    expected_intent: Intent
    risk_tier: RiskTier


@dataclass(frozen=True)
class Decision:
    intent: Intent
    confidence: float


@dataclass(frozen=True)
class RoutedDecision:
    intent: Intent
    confidence: float
    escalated: bool


@dataclass(frozen=True)
class EvalSummary:
    label: str
    total: int
    correct: int
    accuracy: float
    high_risk_misroutes: int
    escalations: int


CASES: tuple[EvalCase, ...] = (
    EvalCase("c01", "what is my balance", Intent.BALANCE, RiskTier.LOW),
    EvalCase("c02", "am i fully covered by fscs", Intent.COVERAGE, RiskTier.LOW),
    EvalCase("c03", "show me savings products and rates", Intent.PRODUCTS, RiskTier.LOW),
    EvalCase("c04", "what does notice period mean", Intent.FAQ, RiskTier.LOW),
    EvalCase("c05", "run a what-if projection simulation", Intent.SIMULATION, RiskTier.HIGH),
    EvalCase("c06", "i consent, optimise my portfolio as balanced", Intent.PORTFOLIO, RiskTier.HIGH),
    EvalCase("c07", "is my account safe and fully covered", Intent.COVERAGE, RiskTier.LOW),
    EvalCase("c08", "help me compare isa products", Intent.PRODUCTS, RiskTier.LOW),
    EvalCase("c09", "simulate and optimise my savings plan", Intent.SIMULATION, RiskTier.HIGH),
    EvalCase("c10", "tell me mortgage refinance options", Intent.UNKNOWN, RiskTier.HIGH),
    EvalCase(
        "c11",
        "please simulate, optimise, compare rates, and check coverage",
        Intent.UNKNOWN,
        RiskTier.HIGH,
    ),
)


def baseline_keyword_classifier(message: str) -> Intent:
    text = message.lower()
    if "balance" in text or "account" in text:
        return Intent.BALANCE
    if "cover" in text or "safe" in text or "fscs" in text or "coverage" in text:
        return Intent.COVERAGE
    if "product" in text or "rate" in text or "compare" in text or "isa" in text:
        return Intent.PRODUCTS
    if "faq" in text or "notice" in text or "withdraw" in text:
        return Intent.FAQ
    if "simulate" in text or "simulation" in text or "projection" in text or "what-if" in text:
        return Intent.SIMULATION
    if "portfolio" in text or "optimise" in text or "optimize" in text:
        return Intent.PORTFOLIO
    return Intent.UNKNOWN


def jev_style_raw_decision(message: str) -> Decision:
    text = message.lower()
    scores = {
        Intent.BALANCE: 0.01,
        Intent.COVERAGE: 0.01,
        Intent.PRODUCTS: 0.01,
        Intent.FAQ: 0.01,
        Intent.SIMULATION: 0.01,
        Intent.PORTFOLIO: 0.01,
        Intent.UNKNOWN: 0.01,
    }

    if "balance" in text or "account" in text:
        scores[Intent.BALANCE] += 0.80
    if "cover" in text or "safe" in text or "fscs" in text or "coverage" in text:
        scores[Intent.COVERAGE] += 0.85
    if "product" in text or "rate" in text or "compare" in text or "isa" in text:
        scores[Intent.PRODUCTS] += 0.80
    if "faq" in text or "notice" in text or "withdraw" in text:
        scores[Intent.FAQ] += 0.75
    if "simulate" in text or "simulation" in text or "projection" in text or "what-if" in text:
        scores[Intent.SIMULATION] += 0.95
    if "portfolio" in text or "optimise" in text or "optimize" in text:
        scores[Intent.PORTFOLIO] += 0.95

    if max(scores.values()) <= 0.20:
        scores[Intent.UNKNOWN] += 0.80

    total = sum(scores.values())
    probabilities = {intent: score / total for intent, score in scores.items()}
    top_intent, top_confidence = max(probabilities.items(), key=lambda item: item[1])
    return Decision(intent=top_intent, confidence=top_confidence)


def route_with_jev_confidence(message: str, min_confidence: float = 0.45) -> RoutedDecision:
    raw = jev_style_raw_decision(message)
    if raw.confidence < min_confidence and raw.intent != Intent.UNKNOWN:
        return RoutedDecision(intent=Intent.UNKNOWN, confidence=raw.confidence, escalated=True)
    return RoutedDecision(intent=raw.intent, confidence=raw.confidence, escalated=False)


def route_with_baseline(message: str) -> RoutedDecision:
    return RoutedDecision(intent=baseline_keyword_classifier(message), confidence=1.0, escalated=False)


def evaluate_baseline(cases: tuple[EvalCase, ...]) -> EvalSummary:
    total = len(cases)
    correct = 0
    high_risk_misroutes = 0
    escalations = 0

    for case in cases:
        predicted = route_with_baseline(case.message)
        if predicted.escalated:
            escalations += 1
        if predicted.intent == case.expected_intent:
            correct += 1
        elif case.risk_tier == RiskTier.HIGH and predicted.intent != Intent.UNKNOWN:
            high_risk_misroutes += 1

    return EvalSummary(
        label="baseline_keyword",
        total=total,
        correct=correct,
        accuracy=correct / total,
        high_risk_misroutes=high_risk_misroutes,
        escalations=escalations,
    )


def evaluate_jev_style(cases: tuple[EvalCase, ...], min_confidence: float) -> EvalSummary:
    total = len(cases)
    correct = 0
    high_risk_misroutes = 0
    escalations = 0

    for case in cases:
        decision = route_with_jev_confidence(case.message, min_confidence=min_confidence)
        if decision.escalated:
            escalations += 1
        if decision.intent == case.expected_intent:
            correct += 1
        elif case.risk_tier == RiskTier.HIGH and decision.intent != Intent.UNKNOWN:
            high_risk_misroutes += 1

    return EvalSummary(
        label=f"jev_style(min_confidence={min_confidence:.2f})",
        total=total,
        correct=correct,
        accuracy=correct / total,
        high_risk_misroutes=high_risk_misroutes,
        escalations=escalations,
    )


def main() -> None:
    print("--- Day 64: Jev-style decision layer evaluation ---")
    threshold = 0.45
    baseline = evaluate_baseline(CASES)
    jev = evaluate_jev_style(CASES, min_confidence=threshold)

    print(
        "Baseline: "
        f"accuracy={baseline.accuracy:.2f}, "
        f"high_risk_misroutes={baseline.high_risk_misroutes}, "
        f"escalations={baseline.escalations}"
    )
    print(
        "Jev-style: "
        f"accuracy={jev.accuracy:.2f}, "
        f"high_risk_misroutes={jev.high_risk_misroutes}, "
        f"escalations={jev.escalations}"
    )

    print("\nCase-level comparison:")
    for case in CASES:
        b = route_with_baseline(case.message)
        j = route_with_jev_confidence(case.message, min_confidence=threshold)
        print(
            f"{case.case_id} expected={case.expected_intent.value:<10} "
            f"baseline={b.intent.value:<10} "
            f"jev={j.intent.value:<10} "
            f"confidence={j.confidence:.2f} "
            f"escalated={str(j.escalated).lower()}"
        )

    assert jev.high_risk_misroutes <= baseline.high_risk_misroutes
    assert jev.accuracy >= baseline.accuracy
    assert jev.escalations >= 1
    print("\n[VERIFIED] Jev-style routing reduced or matched high-risk misroutes.")
    print("[VERIFIED] Jev-style routing matched or improved accuracy on this benchmark.")
    print("[VERIFIED] Confidence gate was exercised by at least one low-confidence mixed-intent case.")


if __name__ == "__main__":
    main()
