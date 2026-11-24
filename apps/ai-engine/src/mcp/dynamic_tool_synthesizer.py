"""Dynamic tool schema introspection & MCP tool synthesis - Day 48.

Large multi-agent platforms can't hard-code every tool schema ahead of
time. As new microservices or database connectors come online via the
Model Context Protocol (MCP), the agent needs to inspect the tool's
manifest at runtime, synthesize a validated Pydantic schema on the fly
(pydantic's create_model), and invoke it with full type safety - without
ever writing a static class for that specific tool.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field, create_model
from pydantic_ai import Agent, RunContext

load_dotenv()

# Simulates an MCP tool manifest discovered from an external server at
# runtime - in a real system this comes from the MCP server's own
# tools/list response, not a hardcoded dict like this.
mcp_tool_manifest: dict = {
    "tool_name": "fetch_bond_yield_curve",
    "description": "Calculates sovereign bond yield curves for portfolio cash placement.",
    "parameters": {
        "benchmark_isin": (str, Field(description="ISIN code for benchmark bond.")),
        "target_tenor_months": (int, Field(ge=1, le=360, description="Tenor duration in months.")),
        "include_spread": (bool, Field(description="Whether to include basis point credit spread.")),
    },
}


def build_dynamic_schema(manifest: dict) -> type[BaseModel]:
    """Dynamically compiles a validated Pydantic model from an MCP parameter schema."""
    field_definitions = manifest["parameters"]
    return create_model(f"{manifest['tool_name']}_Schema", **field_definitions)


DynamicBondInput = build_dynamic_schema(mcp_tool_manifest)

mcp_bridge_agent = Agent(
    "openai:gpt-4o",
    output_type=str,
    system_prompt=(
        "We are an autonomous financial integration architect. "
        "Use the dynamically discovered tool to analyze target sovereign debt allocations."
    ),
)


@mcp_bridge_agent.tool
async def execute_dynamic_mcp_tool(ctx: RunContext[None], tool_args: DynamicBondInput) -> str:
    """Executes the dynamically synthesized tool."""
    print(f"\n[TOOL EXECUTED] Validated payload: {tool_args.model_dump_json()}")
    return (
        f"Synthesized yield calculation complete for {tool_args.benchmark_isin}: "
        f"Yield 4.12% across {tool_args.target_tenor_months} months."
    )


async def main() -> None:
    print("--- Test 1: Dynamic Schema Synthesis from a Valid MCP Manifest ---")
    user_query = "Calculate the bond yield for benchmark ISIN GB00BM8Z2S21 for a 24 month duration."
    print(f"User Request: {user_query}")
    response = await mcp_bridge_agent.run(user_query)
    print("\n=== Agent Result ===")
    print(response.output)

    # Real proof the schema's own validation constraints (ge=1, le=360)
    # actually work, tested directly against the dynamically-built class -
    # the source's demo never exercised this at all, only the happy path.
    print("\n--- Test 2: Directly Verifying the Synthesized Schema Rejects Invalid Input ---")
    try:
        DynamicBondInput(benchmark_isin="GB00BM8Z2S21", target_tenor_months=999, include_spread=True)
        print("BUG: expected a validation error for target_tenor_months=999 (max is 360), but it passed.")
    except Exception as validation_err:
        print(f"[VERIFIED] Dynamically synthesized schema correctly rejected out-of-range input: {type(validation_err).__name__}")

    # Real proof the manifest-driven default actually applies when omitted.
    print("\n--- Test 3: Directly Verifying a Manifest-less Field Requires Explicit Value ---")
    try:
        DynamicBondInput(benchmark_isin="GB00BM8Z2S21", target_tenor_months=24)
        print("BUG: expected include_spread to be required since no default was set in the manifest.")
    except Exception as validation_err:
        print(f"[VERIFIED] include_spread correctly required (no default in manifest): {type(validation_err).__name__}")


if __name__ == "__main__":
    asyncio.run(main())
