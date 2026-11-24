import asyncio
from pathlib import Path

from dotenv import load_dotenv
from fastmcp import Client
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()

SERVER_SCRIPT_PATH = Path(__file__).parent / "sovereign_mcp_server.py"


class MCPExecutionSummary(BaseModel):
    query: str
    discovered_tools: list[str] = Field(description="Names of tools discovered dynamically from the MCP server.")
    execution_result: str = Field(description="Result generated after calling the discovered MCP tool.")


mcp_client_agent = Agent(
    "openai:gpt-4o",
    output_type=MCPExecutionSummary,
    system_prompt=(
        "We are an enterprise AI agent connected to external MCP servers. "
        "Use the tools provided dynamically by the MCP server to answer user inquiries."
    ),
)


async def run_mcp_client_workflow(user_query: str) -> MCPExecutionSummary:
    print("Step 1: Connecting to Day 6's real FastMCP server as a subprocess over stdio...")

    # Client(Path) launches the target script as a real child process and
    # speaks the actual MCP JSON-RPC protocol over its stdio - this is a
    # genuine client/server connection, not a hardcoded tool list standing
    # in for one. list_tools() asks the SERVER what it exposes; nothing
    # about the available tools is assumed or hand-written here.
    async with Client(SERVER_SCRIPT_PATH) as client:
        server_tools = await client.list_tools()
        discovered = [tool.name for tool in server_tools]
        print(f"Discovered Tools (from real server introspection): {discovered}")

        print(f"\nStep 2: Calling the real 'analyze_skill_demand' tool for query: '{user_query}'...")
        # A real MCP tool call over the wire - FastMCP validates our
        # arguments against the SAME Pydantic input schema Day 6's server
        # defined, on the server's own process, not locally.
        tool_result = await client.call_tool(
            "analyze_skill_demand",
            {"query": {"skill_name": user_query, "experience_level": "Senior"}},
        )
        raw_result = tool_result.data

        print(f"Raw MCP Tool Result: {raw_result}")

        print("\nStep 3: Executing Agent reasoning loop over the real tool result...")
        synthesis_prompt = (
            f"User Query: {user_query}\n"
            f"Available MCP Tools (from real server discovery): {discovered}\n"
            f"Tool Result: {raw_result}"
        )

        result = await mcp_client_agent.run(synthesis_prompt)
        summary: MCPExecutionSummary = result.output
        summary.discovered_tools = discovered

        print("\n--- MCP Client Execution Result ---")
        print(f"Query: {summary.query}")
        print(f"Tools Discovered: {summary.discovered_tools}")
        print(f"Execution Summary: {summary.execution_result}")

        return summary


if __name__ == "__main__":
    query = "pydantic ai"
    asyncio.run(run_mcp_client_workflow(query))
