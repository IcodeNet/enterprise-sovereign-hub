Day 23 is about a genuinely important correction to an initial lesson draft: its "MCP client" was fake - a hardcoded tool list and manual if/else dispatch, with no actual client/server protocol anywhere in it - and what a real one looks like instead.

---

## MCP Client — Day 23: Dynamic Tool Discovery & MCP Client Connection

### The Problem We're Solving

Day 6 built a real FastMCP server exposing tools and resources over the Model Context Protocol. But a server is only half the story - something has to actually CONNECT to it, discover what it offers, and call its tools over the wire. The point of MCP is that a client should be able to discover a server's tools AT RUNTIME, without either side hand-coding the other's tool list in advance.

**A real, necessary correction to the initial lesson example**: that version of this lesson didn't do this at all. Its `discovered = ["query_git_commit_history", "get_cloud_infra_status"]` line was a HARDCODED Python list, not a real discovery call, and its `execute_mcp_tool` function was a manual `if tool_name == "...": return query_git_commit_history(...)` dispatcher - plain local function calls with an MCP-shaped comment on top, never actually speaking the MCP protocol to anything. This lesson instead connects a real `fastmcp.Client` over real stdio to Day 6's ACTUAL server, running as a genuine child process, and calls its real `list_tools()` and `call_tool()` methods - the same double-verification discipline Day 6 itself already established.

Focus: a genuine MCP client connecting to a real server, discovering its tools dynamically, and calling one for real
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `fastmcp`, already installed from Day 6.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/mcp/`, create:
`mcp_client_connector.py`

### Step 3: Add the Source Code

```python
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
    # speaks the actual MCP JSON-RPC protocol over its stdio.
    # list_tools() asks the SERVER what it exposes; nothing about the
    # available tools is assumed or hand-written here.
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
```

### Step 4: Run and Verify - a Real Connection, Not a Simulation

```bash
python src/mcp/mcp_client_connector.py
```

A real run: `Discovered Tools (from real server introspection): ['analyze_skill_demand']` - this is the ACTUAL tool Day 6's server exposes, read via a genuine `list_tools()` call, not a name typed into a Python list. The subsequent `call_tool()` genuinely round-trips to the server subprocess and back, returning `{'skill': 'pydantic ai', 'priority_level': 'CRITICAL', ...}` - the real output of Day 6's `analyze_skill_demand` function, computed in a separate process.

---

## Best Practices

- **A hardcoded list with a comment claiming it's "discovered" is not discovery - verify by checking what happens if the server's actual tools changed.** If Day 6's server added a second tool tomorrow, this lesson's `list_tools()` call would show it automatically; a hardcoded list would still silently show only the old ones.
- **Reuse a real server from an earlier lesson instead of writing a second toy one just for the client lesson.** Connecting to Day 6's actual production server (not a stripped-down stand-in) is what makes this lesson's discovery genuinely dynamic rather than a script matching its own fixture.
- **A client library's context manager (`async with Client(...) as client`) handles the subprocess lifecycle (start, connect, clean shutdown) for you** - don't hand-roll subprocess management when the library already provides it safely.

## Why This Matters in Production

A "client" that never actually speaks the protocol it claims to use is worse than no demo at all - it looks like proof the integration works when it proves nothing. This lesson's client genuinely launches Day 6's server as a subprocess, discovers its real tool schema over the wire, and calls it for real - the same standard of evidence this entire portfolio has held every other lesson to.
