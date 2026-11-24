"""Self-healing tool correction via ModelRetry - Day 47.

A standard tool raising an unhandled exception on invalid arguments halts
the whole agent run. Raising pydantic_ai's ModelRetry instead feeds the
error back into the model's own context as a correction prompt, letting
the agent notice the mistake and retry with fixed arguments on its own -
a genuinely different mechanism than Day 27's sandboxed-exec retry loop,
since this operates on a REAL tool call, not generated code.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import ModelRetry

load_dotenv()


class QueryExecutionResult(BaseModel):
    account_id: str = Field(description="Normalized customer account ID.")
    allocated_balance: float = Field(description="Account balance retrieved safely.")
    audit_notes: str = Field(description="Notes regarding self-healing interventions.")


healing_agent = Agent(
    "openai:gpt-4o",
    output_type=QueryExecutionResult,
    system_prompt=(
        "We are an autonomous financial data engineer. "
        "Retrieve account balances using the fetch_account_ledger tool. "
        "Account IDs MUST follow the strict uppercase format: 'ACC-XXXX' (where X are 4 digits)."
    ),
)


@healing_agent.tool
async def fetch_account_ledger(ctx: RunContext[None], raw_account_id: str) -> float:
    """Fetches the verified balance of a business savings account."""
    clean_id = raw_account_id.strip()

    if not clean_id.startswith("ACC-") or len(clean_id) != 8 or not clean_id[4:].isdigit():
        # Raising ModelRetry forces the agent to inspect the error and
        # regenerate its own arguments on the next turn - the model sees
        # this exact message as feedback, not a crash.
        raise ModelRetry(
            f"Invalid account ID format: '{raw_account_id}'. "
            "The ID must strictly match 'ACC-XXXX' with exactly 4 digits (e.g. 'ACC-4081'). "
            "Please normalize the ID and try again."
        )

    return 124500.50


async def main() -> None:
    print("--- Test: Agent Self-Healing Across Faulty Tool Arguments ---")

    imperfect_input = "Please pull the balance for customer ledger account ' acc-4081 '."

    print(f"Submitting query: {imperfect_input}\n")
    response = await healing_agent.run(imperfect_input)

    result: QueryExecutionResult = response.output
    print("=== Execution Verified & Self-Healed ===")
    print(f"Target Account: {result.account_id}")
    print(f"Retrieved Balance: £{result.allocated_balance:,.2f}")
    print(f"Audit Log: {result.audit_notes}")

    # Real proof ModelRetry's mechanism works, tested directly rather than
    # only inferred from the final answer: calling the raw tool function
    # with a bad ID must raise ModelRetry with the exact guidance text.
    print("\n--- Direct Verification: ModelRetry Actually Fires on Bad Input ---")
    try:
        await fetch_account_ledger(None, "not-a-valid-id")
        print("BUG: expected ModelRetry to be raised, but the call succeeded silently.")
    except ModelRetry as retry_err:
        print(f"[VERIFIED] ModelRetry raised as expected: {retry_err}")


if __name__ == "__main__":
    asyncio.run(main())
