"""Memory write policy checks with safety eval cases.

This module keeps long-term memory writes safe by default.
It blocks risky memory content before it reaches the vector store.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class MemoryWriteDecision:
    allowed: bool
    reason: str


@dataclass(frozen=True)
class MemorySafetyEvalCase:
    fact: str
    expected_allowed: bool
    expected_reason: str


def evaluate_memory_write(fact: str) -> MemoryWriteDecision:
    text = fact.strip()
    lower = text.lower()

    if not text:
        return MemoryWriteDecision(False, "empty_fact")

    # Block direct personal contact details.
    if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text):
        return MemoryWriteDecision(False, "contains_email")
    if re.search(r"\+?\d[\d\s\-()]{7,}\d", text):
        return MemoryWriteDecision(False, "contains_phone")

    # Block secrets or credentials.
    if any(token in lower for token in ("api key", "password", "secret", "private key")):
        return MemoryWriteDecision(False, "contains_secret")

    # Block full account identifiers in memory text.
    if re.search(r"\bacc-\d{4,}\b", lower) or re.search(r"#ac-\d{4}-[a-z]\b", lower):
        return MemoryWriteDecision(False, "contains_account_identifier")

    return MemoryWriteDecision(True, "allowed")


def run_memory_safety_evals(cases: list[MemorySafetyEvalCase]) -> float:
    passed = 0
    for case in cases:
        decision = evaluate_memory_write(case.fact)
        if decision.allowed == case.expected_allowed and decision.reason == case.expected_reason:
            passed += 1
    return passed / len(cases) if cases else 0.0


def _default_cases() -> list[MemorySafetyEvalCase]:
    return [
        MemorySafetyEvalCase(
            fact="Customer prefers monthly summary emails.",
            expected_allowed=True,
            expected_reason="allowed",
        ),
        MemorySafetyEvalCase(
            fact="Reach me at byron@example.com for account help.",
            expected_allowed=False,
            expected_reason="contains_email",
        ),
        MemorySafetyEvalCase(
            fact="My mobile is +44 7700 900123.",
            expected_allowed=False,
            expected_reason="contains_phone",
        ),
        MemorySafetyEvalCase(
            fact="Store this API key sk-prod-1234 in memory.",
            expected_allowed=False,
            expected_reason="contains_secret",
        ),
        MemorySafetyEvalCase(
            fact="Account ACC-4081 moved to another institution.",
            expected_allowed=False,
            expected_reason="contains_account_identifier",
        ),
        MemorySafetyEvalCase(
            fact="Prefers clear examples before technical detail.",
            expected_allowed=True,
            expected_reason="allowed",
        ),
    ]


def main() -> None:
    cases = _default_cases()
    accuracy = run_memory_safety_evals(cases)

    print("--- Memory Write Policy Safety Evals ---")
    for case in cases:
        decision = evaluate_memory_write(case.fact)
        print(f"fact={case.fact!r}")
        print(
            f"expected=({case.expected_allowed}, {case.expected_reason}), "
            f"actual=({decision.allowed}, {decision.reason})"
        )

    print(f"safety_eval_accuracy={accuracy:.2%}")
    if accuracy < 1.0:
        raise SystemExit("memory safety eval gate failed")


if __name__ == "__main__":
    main()
