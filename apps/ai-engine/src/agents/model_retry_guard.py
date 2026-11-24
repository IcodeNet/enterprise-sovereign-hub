"""Model retry guard with explicit failure classes - Day 58.

This protects against two opposite mistakes:
1) retrying fatal errors forever,
2) failing fast on transient errors that usually recover.
"""

from dataclasses import dataclass
from enum import Enum


class FailureKind(str, Enum):
    TRANSIENT = "transient"
    FATAL = "fatal"


@dataclass(frozen=True)
class AttemptResult:
    ok: bool
    failure_kind: FailureKind | None = None


@dataclass(frozen=True)
class RetryDecision:
    should_retry: bool
    reason: str


def decide_retry(attempt_number: int, max_retries: int, result: AttemptResult) -> RetryDecision:
    """Classifies whether another model/tool attempt is allowed."""
    if result.ok:
        return RetryDecision(False, "success")

    if result.failure_kind == FailureKind.FATAL:
        return RetryDecision(False, "fatal error - stop immediately")

    if attempt_number > max_retries:
        return RetryDecision(False, f"retry budget exhausted ({max_retries})")

    return RetryDecision(True, f"transient error - retry {attempt_number}/{max_retries}")


def run_with_guard(scripted_results: list[AttemptResult], max_retries: int) -> tuple[bool, int, str]:
    """Runs through scripted outcomes to prove retry behavior deterministically."""
    attempt = 1
    for result in scripted_results:
        decision = decide_retry(attempt, max_retries, result)
        if result.ok:
            return True, attempt, "completed"
        if not decision.should_retry:
            return False, attempt, decision.reason
        attempt += 1

    return False, attempt - 1, "script ended before success"


def main() -> None:
    print("--- Test 1: Transient failure then success should recover within budget ---")
    recovered, attempts, reason = run_with_guard(
        [
            AttemptResult(ok=False, failure_kind=FailureKind.TRANSIENT),
            AttemptResult(ok=True),
        ],
        max_retries=2,
    )
    print(f"Result: recovered={recovered}, attempts={attempts}, reason={reason}")
    assert recovered and attempts == 2
    print("[VERIFIED] Transient failure was retried and recovered.")

    print("\n--- Test 2: Fatal failure should stop immediately with no retry ---")
    recovered, attempts, reason = run_with_guard(
        [AttemptResult(ok=False, failure_kind=FailureKind.FATAL)],
        max_retries=3,
    )
    print(f"Result: recovered={recovered}, attempts={attempts}, reason={reason}")
    assert not recovered and attempts == 1 and "fatal" in reason
    print("[VERIFIED] Fatal failure correctly stopped without wasting retry budget.")

    print("\n--- Test 3: Repeated transient failures should stop at retry budget ---")
    recovered, attempts, reason = run_with_guard(
        [
            AttemptResult(ok=False, failure_kind=FailureKind.TRANSIENT),
            AttemptResult(ok=False, failure_kind=FailureKind.TRANSIENT),
            AttemptResult(ok=False, failure_kind=FailureKind.TRANSIENT),
        ],
        max_retries=2,
    )
    print(f"Result: recovered={recovered}, attempts={attempts}, reason={reason}")
    assert not recovered and attempts == 3 and "budget exhausted" in reason
    print("[VERIFIED] Retry loop stopped exactly at the configured budget.")


if __name__ == "__main__":
    main()
