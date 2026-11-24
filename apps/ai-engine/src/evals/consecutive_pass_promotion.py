"""Consecutive-pass promotion windows for eval gates - Day 57.

Day 56 solved *what* baseline to compare against.
Day 57 solves *when* to promote: one green run can be a lucky outlier,
so promotion now requires a short stability window of consecutive passes,
with each run still checked against the approved baseline tolerance.
"""

from dataclasses import dataclass


@dataclass
class EvalRun:
    run_id: str
    score: float
    gate_passed: bool


def should_promote_after_window(
    history: list[EvalRun],
    approved_baseline_score: float,
    *,
    window_size: int = 3,
    max_regression: float = 0.02,
) -> tuple[bool, str]:
    """Returns promotion decision plus an operator-readable reason."""
    if len(history) < window_size:
        return False, f"need {window_size} runs, got {len(history)}"

    window = history[-window_size:]

    failed = [run.run_id for run in window if not run.gate_passed]
    if failed:
        return False, f"window contains gate failures: {failed}"

    for run in window:
        drop = approved_baseline_score - run.score
        if (drop - max_regression) > 1e-9:
            return (
                False,
                f"run {run.run_id} regressed {drop:.3f} > allowed {max_regression:.3f}",
            )

    return True, f"{window_size} consecutive passes within regression tolerance"


def main() -> None:
    print("--- Test 1: One Good Run Is Not Enough If the Window Is Unstable ---")
    unstable_history = [
        EvalRun("r101", 0.95, True),
        EvalRun("r102", 0.96, False),
        EvalRun("r103", 0.95, True),
    ]
    promote, reason = should_promote_after_window(unstable_history, approved_baseline_score=0.96)
    print(f"Decision: promote={promote} | reason={reason}")
    assert not promote, "BUG: unstable window should not promote."
    print("[VERIFIED] Promotion correctly blocked because one run in the window failed its gate.")

    print("\n--- Test 2: Stable 3-Run Pass Window Promotes ---")
    stable_history = [
        EvalRun("r201", 0.95, True),
        EvalRun("r202", 0.95, True),
        EvalRun("r203", 0.94, True),
    ]
    promote, reason = should_promote_after_window(
        stable_history,
        approved_baseline_score=0.96,
        window_size=3,
        max_regression=0.02,
    )
    print(f"Decision: promote={promote} | reason={reason}")
    assert promote, "BUG: stable passing window should promote."
    print("[VERIFIED] Promotion allowed after 3 consecutive passing runs stayed within tolerance.")

    print("\n--- Test 3: Consecutive Passes Still Block If Any Run Regresses Too Far ---")
    regressed_history = [
        EvalRun("r301", 0.95, True),
        EvalRun("r302", 0.93, True),
        EvalRun("r303", 0.95, True),
    ]
    promote, reason = should_promote_after_window(
        regressed_history,
        approved_baseline_score=0.96,
        window_size=3,
        max_regression=0.02,
    )
    print(f"Decision: promote={promote} | reason={reason}")
    assert not promote, "BUG: run that regresses > tolerance must block promotion."
    print("[VERIFIED] Promotion correctly blocked even with consecutive passes because one run regressed beyond tolerance.")


if __name__ == "__main__":
    main()
