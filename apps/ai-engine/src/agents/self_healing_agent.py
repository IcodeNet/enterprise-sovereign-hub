"""Self-healing code execution agent - Day 27.

Generates Python code for a task, runs it in a sandboxed namespace, and if
it throws, feeds the real traceback straight back to the model as the next
prompt - a bounded retry loop that fixes its own mistakes instead of
crashing the pipeline on the first bad generation.
"""

import asyncio
import io
import sys
import traceback

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class CodeSolution(BaseModel):
    code: str = Field(description="Executable Python code snippet without markdown formatting.")
    explanation: str = Field(description="Summary of the implementation.")


class ExecutionOutcome(BaseModel):
    is_successful: bool
    stdout: str
    error_message: str | None = None


code_repair_agent = Agent(
    "openai:gpt-4o",
    output_type=CodeSolution,
    system_prompt=(
        "We are an autonomous self-healing software engineer. "
        "Write clean, executable Python code. When given an error traceback, "
        "diagnose the root cause and output corrected code."
    ),
)


def execute_in_sandbox(python_code: str) -> ExecutionOutcome:
    """Runs generated code in an isolated namespace and captures real stdout/tracebacks.

    A fresh dict for both globals and locals keeps the generated code from
    reading or mutating this module's own state - the isolation the PDF's
    original version was missing (it passed this module's real globals()).
    """
    buffer = io.StringIO()
    original_stdout = sys.stdout
    sys.stdout = buffer

    try:
        sandbox_namespace: dict = {}
        exec(python_code, sandbox_namespace)  # noqa: S102 - deliberate sandboxed execution, the lesson's subject
        sys.stdout = original_stdout
        return ExecutionOutcome(is_successful=True, stdout=buffer.getvalue())
    except Exception:
        sys.stdout = original_stdout
        error_trace = traceback.format_exc()
        return ExecutionOutcome(is_successful=False, stdout=buffer.getvalue(), error_message=error_trace)


async def run_self_healing_pipeline(task_description: str, max_retries: int = 3) -> CodeSolution:
    print(f"Step 1: Drafting initial solution for task: '{task_description}'...")

    current_prompt = f"Write Python code to solve: {task_description}"
    last_error: str | None = None

    for attempt in range(1, max_retries + 1):
        print(f"\n--- Execution Attempt {attempt}/{max_retries} ---")

        if last_error:
            current_prompt = (
                f"Previous code execution failed with the following error:\n{last_error}\n\n"
                f"Please fix the code to resolve the error and fulfill the original task: {task_description}"
            )

        result = await code_repair_agent.run(current_prompt)
        solution: CodeSolution = result.output

        outcome = execute_in_sandbox(solution.code)

        if outcome.is_successful:
            print("[SANDBOX SUCCESS] Code executed cleanly without errors.")
            print(f"Captured Output:\n{outcome.stdout}")
            return solution

        print(f"[SANDBOX FAILURE] Error encountered on attempt {attempt}.")
        print(f"Traceback:\n{outcome.error_message}")
        last_error = outcome.error_message

    raise RuntimeError(f"Failed to auto-repair code within {max_retries} attempts.")


if __name__ == "__main__":
    prompt = "Calculate the standard deviation of [12, 45, 67, 89, 23, 56, 78] using the math library directly."
    asyncio.run(run_self_healing_pipeline(prompt))
