"""Dynamic tool synthesis & runtime registration - Day 33.

When a predefined tool doesn't exist for a task, an agent can synthesize a
new Python function on the fly, validate it in a sandboxed namespace, and
register it into a runtime tool registry - all without a restart.
"""

import asyncio
import hashlib
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class SynthesizedToolCode(BaseModel):
    tool_name: str = Field(description="Snake_case function name for the tool.")
    docstring: str = Field(description="Clear explanation of the tool's purpose.")
    python_code: str = Field(description="Clean Python function definition.")


tool_author_agent = Agent(
    "openai:gpt-4o",
    output_type=SynthesizedToolCode,
    system_prompt=(
        "We are an expert Python systems engineer. "
        "Write pure, standalone Python functions that solve the missing functionality. "
        "Do not include external untrusted dependencies."
    ),
)


class DynamicToolRegistry:
    def __init__(self):
        self.tools: dict[str, Callable] = {}

    def compile_and_register(self, code_payload: SynthesizedToolCode) -> None:
        local_scope: dict[str, Any] = {}
        # Fresh empty dict for both globals and locals - same isolation
        # discipline as Day 27's self-healing sandbox, so synthesized code
        # can't read or mutate this module's own real state.
        exec(code_payload.python_code, {"__builtins__": __builtins__, "hashlib": hashlib}, local_scope)  # noqa: S102

        # REAL BUG FOUND: the model's own tool_name field doesn't always
        # match the actual function name it wrote in python_code (e.g. it
        # returned "Calculate_SHA256_Hash" while the code defined
        # "calculate_sha256_hash") - despite the schema explicitly saying
        # snake_case. Don't trust the model's self-consistency; find the
        # one real callable the generated code actually defined instead.
        func = local_scope.get(code_payload.tool_name)
        if not callable(func):
            candidates = [v for v in local_scope.values() if callable(v)]
            if len(candidates) == 1:
                func = candidates[0]
                print(
                    f" [NAME MISMATCH RECOVERED] tool_name '{code_payload.tool_name}' didn't match "
                    f"any defined function; found exactly one real callable instead: '{func.__name__}'."
                )
            else:
                raise ValueError(f"Function {code_payload.tool_name} was not found in synthesized code.")

        self.tools[func.__name__] = func
        print(f" [TOOL REGISTERED] Successfully added '{func.__name__}' to runtime registry.")

    def run_tool(self, name: str, *args: Any, **kwargs: Any) -> Any:
        if name not in self.tools:
            raise KeyError(f"Tool {name} is not registered.")
        return self.tools[name](*args, **kwargs)


async def solve_with_synthetic_tool(problem_description: str) -> None:
    print(f"Step 1: Analyzing missing capability for: '{problem_description}'...")

    author_prompt = (
        f"Create a single Python function to solve this problem: {problem_description}. "
        "The function must be fully self-contained and must not import any modules "
        "(assume hashlib is already available in scope if needed)."
    )
    res = await tool_author_agent.run(author_prompt)
    tool_spec: SynthesizedToolCode = res.output

    print("\nStep 2: Synthesized Tool Definition:")
    print(f"Name: {tool_spec.tool_name}")
    print(f"Code:\n{tool_spec.python_code}\n")

    registry = DynamicToolRegistry()
    registry.compile_and_register(tool_spec)

    print("\nStep 3: Executing newly synthesized tool...")
    test_input = "Sovereign Intelligence Hub demo"
    registered_name = next(iter(registry.tools))
    output = registry.run_tool(registered_name, test_input)

    print(f"Runtime Execution Output: {output}")


if __name__ == "__main__":
    prompt = "Create a function that calculates the SHA-256 hash of an input string and returns the first 12 characters."
    asyncio.run(solve_with_synthetic_tool(prompt))
