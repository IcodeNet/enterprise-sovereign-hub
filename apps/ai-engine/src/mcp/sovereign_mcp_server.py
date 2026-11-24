from fastmcp import FastMCP
from pydantic import BaseModel, Field

# Instantiates the server: this object is what turns our plain Python
# functions below into something any MCP-aware AI client (Claude Desktop,
# Cursor, our own Sovereign Intelligence Hub) can discover and call, without
# us writing any custom integration glue for each client.
mcp = FastMCP(name="Sovereign Intelligence Hub MCP Server")


# A structured input model, same idea as Day 1's response schema, but this
# time validating what comes IN to a tool rather than what comes back out.
# FastMCP reads this model's field types and descriptions to build the
# tool's schema automatically - we never hand-write any JSON schema.
class SkillQueryInput(BaseModel):
    skill_name: str = Field(description="The engineering tool or library to query.")
    experience_level: str = Field(default="Senior", description="Developer target seniority level.")


# @mcp.tool turns this plain function into something an AI client can call
# by name, with FastMCP handling the request/response translation. The
# function's own docstring and type hints (not extra config) are what the
# client sees as the tool's description and schema.
@mcp.tool(
    name="analyze_skill_demand",
    description="Evaluates job market frequency and architecture fit for a skill.",
)
def analyze_skill_demand(query: SkillQueryInput) -> dict:
    """FastMCP automatically converts function type hints and docstrings into an MCP schema."""
    target = query.skill_name.lower().strip()

    # Mock demand index standing in for a real database lookup, the same
    # kind of stand-in Day 2's live-data tool used.
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


# @mcp.resource exposes read-only data at a named address (a URI), the same
# way a website exposes a page at a URL. A client can fetch this without
# needing to know it's backed by a Python function at all.
@mcp.resource("resource://hub/status")
def get_hub_status() -> dict:
    """Provides operational metrics for our Sovereign Intelligence Hub."""
    return {
        "status": "HEALTHY",
        "active_modules": ["Pydantic AI", "Vercel AI SDK", "LlamaIndex", "LangGraph", "FastMCP"],
        "pipeline_frequency": "DAILY_0700_UTC",
    }


# A DYNAMIC resource: the {category} part of the URI is a placeholder, so
# this one function answers for many different addresses
# (resource://skills/agents, resource://skills/rag, etc.) instead of us
# writing one fixed function per category.
@mcp.resource("resource://skills/{category}")
def get_skills_by_category(category: str) -> list[str]:
    """Dynamic resource template providing core tech listings by architectural domain."""
    domain_map = {
        "agents": ["Pydantic AI", "LangGraph", "AutoGPT"],
        "rag": ["LlamaIndex", "Azure AI Search", "Pinecone"],
        "protocols": ["FastMCP", "OpenTelemetry", "REST"],
    }
    return domain_map.get(category.lower(), ["Python", "TypeScript"])


# Starts the server over STDIO (standard input/output) - the same channel
# an IDE extension or desktop AI client talks over when it runs our server
# as a local subprocess, rather than connecting to it as a network address.
if __name__ == "__main__":
    mcp.run()
