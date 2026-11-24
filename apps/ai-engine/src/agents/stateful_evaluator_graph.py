"""Stateful evaluator graph with explicit terminal states - Day 59.

Goal: replace hidden retry/fallback branching with a visible state machine
so each answer attempt has an auditable path to APPROVED or REJECTED.
"""

from dataclasses import dataclass
from enum import Enum


class EvalState(str, Enum):
    DRAFT = "draft"
    EVALUATING = "evaluating"
    NEEDS_REVISION = "needs_revision"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class EvalContext:
    attempt: int
    max_attempts: int
    score: float
    threshold: float
    state: EvalState = EvalState.DRAFT


def step(context: EvalContext) -> EvalContext:
    if context.state == EvalState.DRAFT:
        context.state = EvalState.EVALUATING
        return context

    if context.state == EvalState.EVALUATING:
        if context.score >= context.threshold:
            context.state = EvalState.APPROVED
            return context

        if context.attempt >= context.max_attempts:
            context.state = EvalState.REJECTED
        else:
            context.attempt += 1
            context.state = EvalState.NEEDS_REVISION
        return context

    if context.state == EvalState.NEEDS_REVISION:
        context.state = EvalState.DRAFT
        return context

    return context


def run_graph(scores: list[float], threshold: float, max_attempts: int) -> EvalContext:
    context = EvalContext(attempt=1, max_attempts=max_attempts, score=scores[0], threshold=threshold)
    score_index = 0

    while context.state not in {EvalState.APPROVED, EvalState.REJECTED}:
        context = step(context)
        if context.state == EvalState.DRAFT and score_index + 1 < len(scores):
            score_index += 1
            context.score = scores[score_index]

    return context


def main() -> None:
    print("--- Test 1: First attempt clears threshold -> approved ---")
    approved = run_graph(scores=[0.92], threshold=0.9, max_attempts=3)
    print(f"Terminal: {approved.state}, attempts={approved.attempt}, score={approved.score}")
    assert approved.state == EvalState.APPROVED and approved.attempt == 1
    print("[VERIFIED] Graph approved immediately when score met threshold.")

    print("\n--- Test 2: Revision path then approval on second attempt ---")
    revised = run_graph(scores=[0.74, 0.91], threshold=0.9, max_attempts=3)
    print(f"Terminal: {revised.state}, attempts={revised.attempt}, score={revised.score}")
    assert revised.state == EvalState.APPROVED and revised.attempt == 2
    print("[VERIFIED] Graph moved through NEEDS_REVISION and approved after retry.")

    print("\n--- Test 3: Exhaust attempts -> rejected ---")
    rejected = run_graph(scores=[0.5, 0.62, 0.7], threshold=0.9, max_attempts=3)
    print(f"Terminal: {rejected.state}, attempts={rejected.attempt}, score={rejected.score}")
    assert rejected.state == EvalState.REJECTED and rejected.attempt == 3
    print("[VERIFIED] Graph rejected exactly at the configured attempt cap.")


if __name__ == "__main__":
    main()
