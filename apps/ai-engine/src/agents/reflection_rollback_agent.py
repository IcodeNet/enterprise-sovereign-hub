"""Grounded self-reflection with transactional state rollback - Day 43.

Letting an agent continue after generating flawed code or invalid data
poisons downstream memory with the failure. This snapshots state before
each attempt, generates a candidate, has an independent critic evaluate it
against explicit invariants, and rolls back to the pre-attempt snapshot
(injecting the critique as feedback) if it fails - rather than letting a
rejected draft ever touch committed state.
"""

import asyncio
import copy

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class SystemDesignDraft(BaseModel):
    component_name: str
    code_snippet: str = Field(description="Executable Python snippet.")
    has_retry_logic: bool
    uses_type_hints: bool


class CritiqueVerdict(BaseModel):
    passed: bool = Field(description="True only if all enterprise quality invariants pass.")
    score: int = Field(description="Score between 1 and 10.")
    feedback: str = Field(description="Actionable diagnostic feedback for the generator.")


generator_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=SystemDesignDraft,
    system_prompt=(
        "We are an autonomous software generation agent. "
        "Write robust, typed Python components based on user requirements and iterative critique."
    ),
)

critic_agent = Agent(
    "openai:gpt-4o",
    output_type=CritiqueVerdict,
    system_prompt=(
        "We are a principal code review auditor. Enforce strict standards: "
        "1. Must include explicit type annotations on all parameters and returns. "
        "2. Must include explicit error handling or retry logic. "
        "Reject any code that fails these criteria."
    ),
)


class TransactionalSessionState:
    def __init__(self):
        self.committed_history: list[str] = []
        self._snapshot: list[str] | None = None

    def create_checkpoint(self) -> None:
        self._snapshot = copy.deepcopy(self.committed_history)
        print(" [CHECKPOINT] Created state snapshot.")

    def rollback(self) -> None:
        if self._snapshot is not None:
            self.committed_history = copy.deepcopy(self._snapshot)
            print(" [ROLLBACK] Reverted memory state to pre-transaction checkpoint.")

    def commit(self, final_entry: str) -> None:
        self.committed_history.append(final_entry)
        self._snapshot = None
        print(" [TRANSACTION COMMITTED] Output approved and state updated.")


async def run_reflection_loop(task: str, max_iterations: int = 3) -> SystemDesignDraft:
    state = TransactionalSessionState()
    state.create_checkpoint()

    current_prompt = f"Design a Python component for: {task}"
    critique_feedback: str | None = None

    for iteration in range(1, max_iterations + 1):
        print(f"\n--- Reflection Loop Turn {iteration}/{max_iterations} ---")

        if critique_feedback:
            current_prompt += f"\n\nPrevious draft was rejected with feedback:\n{critique_feedback}\nFix these issues."

        gen_res = await generator_agent.run(current_prompt)
        draft: SystemDesignDraft = gen_res.output
        print(f"Generated Component: '{draft.component_name}'")

        review_prompt = (
            f"Component Name: {draft.component_name}\n"
            f"Code:\n{draft.code_snippet}\n"
            f"Reported Retry Logic: {draft.has_retry_logic}\n"
            f"Reported Type Hints: {draft.uses_type_hints}"
        )
        critic_res = await critic_agent.run(review_prompt)
        verdict: CritiqueVerdict = critic_res.output

        print(f"Critic Review: Passed={verdict.passed} | Score={verdict.score}/10")
        print(f"Feedback: {verdict.feedback}")

        if verdict.passed:
            state.commit(f"Component: {draft.component_name} deployed successfully.")
            return draft
        else:
            # Revert state to avoid poisoning context with defective output.
            state.rollback()
            critique_feedback = verdict.feedback

    raise RuntimeError("Failed to satisfy quality standards within maximum iterations.")


if __name__ == "__main__":

    async def main() -> None:
        task = "A resilient Redis caching client with exponential backoff on connection timeout."
        result = await run_reflection_loop(task, max_iterations=3)
        print("\n=== Verified Component Approved ===")
        print(f"Name: {result.component_name}")
        print(f"Snippet:\n{result.code_snippet}")

    asyncio.run(main())
