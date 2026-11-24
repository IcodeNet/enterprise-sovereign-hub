"""Deterministic retrieval method chooser with routing-accuracy checks.

This keeps retrieval routing explicit and testable:
- hybrid: mixed semantic + exact-id search
- graph: relationship and path-based questions
- tenant-sharded: customer/tenant scoped account lookups
"""

from __future__ import annotations

import re
from dataclasses import dataclass


RETRIEVAL_METHODS = ("hybrid", "graph", "tenant-sharded")


@dataclass(frozen=True)
class RoutingCase:
    query: str
    expected_method: str


def choose_retrieval_method(query: str) -> str:
    q = query.lower()

    # Relationship/path language maps to graph retrieval.
    if any(token in q for token in ("held at", "protected by", "relationship", "graph", "entity")):
        return "graph"

    # Exact IDs and mixed "tools + id" asks benefit from hybrid retrieval.
    if re.search(r"\bacc-\d{3,}\b", q) or re.search(r"#ac-\d{4}-[a-z]\b", q):
        return "hybrid"

    # Tenant/account scope language maps to tenant-sharded retrieval.
    if any(token in q for token in ("tenant", "customer", "my account", "for customer", "portfolio for")):
        return "tenant-sharded"

    # Safe default for general grounded lookup.
    return "hybrid"


def run_routing_accuracy(cases: list[RoutingCase]) -> float:
    correct = 0
    for case in cases:
        actual = choose_retrieval_method(case.query)
        if actual == case.expected_method:
            correct += 1
    return correct / len(cases) if cases else 0.0


def _default_cases() -> list[RoutingCase]:
    return [
        RoutingCase(
            query="What exact tools power the hub and Account ID #AC-9042-X?",
            expected_method="hybrid",
        ),
        RoutingCase(
            query="Where is account ACC-4081 held and what protection applies?",
            expected_method="hybrid",
        ),
        RoutingCase(
            query="Show graph relationship path for ACC-4081 to regulator",
            expected_method="graph",
        ),
        RoutingCase(
            query="Find data for customer customer-001 accounts",
            expected_method="tenant-sharded",
        ),
        RoutingCase(
            query="What products are available for tenant alpha?",
            expected_method="tenant-sharded",
        ),
        RoutingCase(
            query="Explain entity relationship for Partner Bank C",
            expected_method="graph",
        ),
    ]


def main() -> None:
    cases = _default_cases()
    accuracy = run_routing_accuracy(cases)

    print("--- Retrieval Router Accuracy ---")
    for case in cases:
        actual = choose_retrieval_method(case.query)
        print(f"query={case.query!r}")
        print(f"expected={case.expected_method}, actual={actual}")

    print(f"routing_accuracy={accuracy:.2%}")
    if accuracy < 1.0:
        raise SystemExit("routing accuracy gate failed")


if __name__ == "__main__":
    main()
