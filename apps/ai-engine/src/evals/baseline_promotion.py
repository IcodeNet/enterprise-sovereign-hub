"""Last-approved baseline promotion for eval gates - Day 56.

Independently designed rather than sourced from the PDF curriculum,
which ends at Day 54 in this repo's renumbering (see AGENTS.md). This
closes out a round 56 with a widely used eval-methodology
pattern this repo hadn't yet built as a standalone day.

An eval suite that only compares a new candidate against yesterday's
result has a real failure mode: if yesterday's run was ALSO a
regression that slipped through, comparing against it just re-approves
the same regression forever - "no worse than yesterday" quietly becomes
"no worse than the last bad thing we shipped." Last-approved
promotion fixes this by walking BACKWARD through recent history to find
the newest report that actually PASSED its own gate, and comparing the
new candidate against THAT - a real, previously-approved baseline, not
just whatever ran most recently.
"""

import asyncio
from dataclasses import dataclass


@dataclass
class EvalReport:
    commit_sha: str
    suite_name: str
    pass_rate: float
    gate_passed: bool


def find_promotable_baseline(history: list[EvalReport], suite_name: str) -> EvalReport | None:
    """Walks backward through history to find the newest report that fully passed its own gate."""
    for report in reversed(history):
        if report.suite_name == suite_name and report.gate_passed:
            return report
    return None


def compare_against_baseline(candidate: EvalReport, baseline: EvalReport, tolerance: float = 0.02) -> dict:
    """Compares a candidate's pass rate against a fully passing baseline, allowing a small tolerance."""
    drop_points = (baseline.pass_rate - candidate.pass_rate) * 100
    is_regression = drop_points > (tolerance * 100)
    return {
        "baseline_commit": baseline.commit_sha,
        "baseline_rate": baseline.pass_rate,
        "candidate_rate": candidate.pass_rate,
        "drop_points": round(drop_points, 2),
        "is_regression": is_regression,
    }


async def main() -> None:
    print("--- Test 1: Correctly Skip Past a Failing Report to Find the Real Baseline ---")
    # A realistic commit history: a genuinely good baseline, then a
    # commit that broke the gate, then today's candidate under review.
    history = [
        EvalReport(commit_sha="a1b2c3d", suite_name="faq_eval", pass_rate=0.94, gate_passed=True),
        EvalReport(commit_sha="e4f5g6h", suite_name="faq_eval", pass_rate=0.71, gate_passed=False),  # a broken commit
    ]
    candidate = EvalReport(commit_sha="i7j8k9l", suite_name="faq_eval", pass_rate=0.90, gate_passed=True)

    baseline = find_promotable_baseline(history, "faq_eval")
    assert baseline is not None, "BUG: expected to find a fully passing baseline in history."
    assert baseline.commit_sha == "a1b2c3d", (
        f"BUG: expected the baseline to skip past the FAILING commit and land on the last fully passing one, "
        f"but got '{baseline.commit_sha}' instead."
    )
    print(f"[VERIFIED] Baseline correctly skipped the failing commit ('e4f5g6h', rate=0.71) and landed on the last fully passing one ('{baseline.commit_sha}', rate={baseline.pass_rate}).")

    comparison = compare_against_baseline(candidate, baseline)
    print(f"Comparison result: {comparison}")
    assert comparison["is_regression"], (
        f"BUG: a {comparison['drop_points']}-point drop from a 94% baseline should be a genuine regression, but was not flagged."
    )
    print(f"[VERIFIED] The candidate (90%) vs. the genuine baseline (94%) is correctly flagged as a regression ({comparison['drop_points']} points, exceeds the 2-point tolerance).")

    # Real proof the OPPOSITE mistake this pattern is designed to prevent
    # would actually happen if baseline selection were naive: comparing
    # the SAME candidate against the FAILING commit (a naive "just use
    # the most recent report" approach) would incorrectly NOT flag a
    # regression, because 90% looks fine next to a broken 71% baseline.
    print("\n--- Test 2: Proving the Naive 'Most Recent Report' Approach Would Have Missed This ---")
    naive_baseline = history[-1]  # the most recent report, regardless of whether its own gate passed
    naive_comparison = compare_against_baseline(candidate, naive_baseline)
    print(f"Naive comparison (against the failing commit, not the real baseline): {naive_comparison}")
    assert not naive_comparison["is_regression"], "Test setup issue: expected the naive comparison to (wrongly) look fine."
    print(
        "[CONFIRMED THE FAILURE MODE] Comparing against the most recent report (which itself never passed its own gate) "
        "incorrectly shows NO regression - this is exactly the silent 'approve the same bad thing forever' bug that "
        "walking backward to a fully passing baseline prevents."
    )

    # Third scenario: a suite with NO passing history at all should
    # report that honestly, not silently skip the check.
    print("\n--- Test 3: A Suite With No Passing History Reports That Honestly ---")
    no_baseline_history = [EvalReport(commit_sha="x1y2z3", suite_name="new_suite", pass_rate=0.5, gate_passed=False)]
    missing_baseline = find_promotable_baseline(no_baseline_history, "new_suite")
    assert missing_baseline is None, "BUG: expected no promotable baseline for a suite with zero passing history."
    print("[VERIFIED] A suite with zero fully passing history correctly reports no promotable baseline, rather than silently skipping the regression check.")


if __name__ == "__main__":
    asyncio.run(main())
