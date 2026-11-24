Day 6 is about exposing our own tools and data to ANY AI client - not just the ones we build ourselves - using an open standard instead of custom, one-off integration code.

---

## Model Context Protocol — Day 6: FastMCP Server Architecture

### The Problem We're Solving

Every AI client that wants to use one of our tools has needed its own custom integration code so far - a tool built for Pydantic AI in Day 2 can't be picked up and used by Claude Desktop, Cursor, or any other AI tool without us writing fresh glue code for each one.

MCP (Model Context Protocol) fixes this by being an open standard: define a tool, resource, or prompt once, in one server, and any MCP-aware client - Claude Desktop, Cursor, VS Code, our own hub - can discover and call it without us writing any client-specific code. FastMCP is the framework that removes the protocol boilerplate: we write plain Python functions with type hints, and it handles turning them into a valid MCP server automatically.

An MCP server exposes three kinds of things:
- **Tools**: functions an AI client can call, like Day 2's `fetch_live_skill_count` tool, but reachable by any MCP client, not just our own agent code.
- **Resources**: read-only data at a named address (like a URL), that a client can fetch without knowing it's backed by a function.
- **Prompts**: reusable prompt templates a client can request (not covered in this lesson).

Focus: exposing a typed tool and both a static and a dynamic resource over the MCP standard
Time investment: 15 minutes

### Step 1: Install FastMCP

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install fastmcp
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/mcp/`, create:
`sovereign_mcp_server.py`

### Step 3: Add the Source Code

```python
from fastmcp import FastMCP
from pydantic import BaseModel, Field

mcp = FastMCP(name="Sovereign Intelligence Hub MCP Server")


class SkillQueryInput(BaseModel):
    skill_name: str = Field(description="The engineering tool or library to query.")
    experience_level: str = Field(default="Senior", description="Developer target seniority level.")


@mcp.tool(
    name="analyze_skill_demand",
    description="Evaluates job market frequency and architecture fit for a skill.",
)
def analyze_skill_demand(query: SkillQueryInput) -> dict:
    """FastMCP automatically converts function type hints and docstrings into an MCP schema."""
    target = query.skill_name.lower().strip()

    high_demand_stack = ["pydantic ai", "fastmcp", "vercel ai sdk", "llamaindex", "langgraph"]
    is_priority = any(tech in target for tech in high_demand_stack)

    return {
        "skill": query.skill_name,
        "priority_level": "CRITICAL" if is_priority else "STANDARD",
        "recommended_action": "Generate daily 15-min tutorial"
        if is_priority
        else "Add to backlog for later review",
        "target_seniority": query.experience_level,
    }


@mcp.resource("resource://hub/status")
def get_hub_status() -> dict:
    """Provides operational metrics for our Sovereign Intelligence Hub."""
    return {
        "status": "HEALTHY",
        "active_modules": ["Pydantic AI", "Vercel AI SDK", "LlamaIndex", "LangGraph", "FastMCP"],
        "pipeline_frequency": "DAILY_0700_UTC",
    }


@mcp.resource("resource://skills/{category}")
def get_skills_by_category(category: str) -> list[str]:
    """Dynamic resource template providing core tech listings by architectural domain."""
    domain_map = {
        "agents": ["Pydantic AI", "LangGraph", "AutoGPT"],
        "rag": ["LlamaIndex", "Azure AI Search", "Pinecone"],
        "protocols": ["FastMCP", "OpenTelemetry", "REST"],
    }
    return domain_map.get(category.lower(), ["Python", "TypeScript"])


if __name__ == "__main__":
    mcp.run()
```

### Step 4: Verify the Server Actually Works

An MCP server normally waits on standard input/output for a real client to connect - running the file directly just makes it sit there waiting silently. To verify it for real, connect an actual MCP client to it in-process:

```bash
python -c "
import asyncio
from fastmcp import Client
import sys
sys.path.insert(0, 'src/mcp')
from sovereign_mcp_server import mcp

async def main():
    async with Client(mcp) as client:
        tools = await client.list_tools()
        print('Tools:', [t.name for t in tools])
        result = await client.call_tool('analyze_skill_demand', {'query': {'skill_name': 'FastMCP', 'experience_level': 'Senior'}})
        print('Tool result:', result.data if hasattr(result, 'data') else result.content)

asyncio.run(main())
"
```

You should see the tool listed and a real call return `priority_level: 'CRITICAL'` (FastMCP is in our high-demand list).

You can also inspect the server's shape without writing a client, using FastMCP's own CLI:

```bash
fastmcp inspect src/mcp/sovereign_mcp_server.py
```

This prints the server's name, and how many tools, resources, and resource templates it exposes - confirming the server is well-formed before ever connecting a real AI client to it.

---

## Best Practices

- **Verify a server by actually connecting a client to it, not just by running the file.** An MCP server that starts and sits there waiting for stdio input looks identical whether it's correctly wired or completely broken - only a real client call proves the tool and resource logic actually works.
- **Let type hints and docstrings generate the schema - don't hand-write it.** FastMCP reads the function's parameter types and the Pydantic model's field descriptions to build the tool's schema automatically; hand-writing a matching JSON schema alongside the function would be duplicated work that can silently drift out of sync.
- **Use a dynamic resource template (with a `{placeholder}`) instead of one fixed function per category.** `resource://skills/{category}` answers for `agents`, `rag`, `protocols`, and any future category through one function, instead of needing a new function and a new registration every time a category is added.

## Why This Matters in Production

Any tool we build once, as an MCP server, becomes usable by every MCP-aware AI client without us writing custom glue for each one - Claude Desktop, Cursor, VS Code, or our own Sovereign Intelligence Hub interface can all reach the same `analyze_skill_demand` tool and the same resources. This is what makes it worth investing in a tool once, properly, rather than rewriting it slightly differently for every place it needs to be called from.
