"""Semantic guardrails intercepting FastMCP tool payloads before execution - Day 44.

Static type checking on a tool's arguments (a string is a string) doesn't
catch a semantic exploit - a SQL injection pattern or an unauthorized table
name is still a syntactically valid string. This intercepts the actual
argument payload with a Pydantic validator carrying real security rules,
before the tool's real logic ever runs.
"""

import asyncio
import re

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator
from pydantic_ai import Agent, RunContext

load_dotenv()


class DatabaseQueryPayload(BaseModel):
    table_name: str = Field(description="Target database table name.")
    filter_column: str = Field(description="Column to filter by.")
    filter_value: str = Field(description="Exact value to query.")
    limit: int = Field(default=10, le=100, description="Max rows to return, capped at 100.")

    @field_validator("table_name")
    @classmethod
    def validate_allowed_tables(cls, v: str) -> str:
        allowed = {"market_trends", "skills_inventory", "agent_logs"}
        normalized = v.lower().strip()
        if normalized not in allowed:
            raise ValueError(f"Unauthorized table access: '{v}'. Permitted: {allowed}")
        return normalized

    @field_validator("filter_value")
    @classmethod
    def sanitize_filter_value(cls, v: str) -> str:
        # Prevent SQL injection patterns and script tags.
        dangerous_patterns = [r"--", r";", r"/\*", r"\*/", r"@@", r"char\s*\(", r"drop\s+", r"delete\s+"]
        for pattern in dangerous_patterns:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError(f"Semantic security violation detected in query argument: '{v}'")
        return v.strip()


async def internal_query_database(payload: DatabaseQueryPayload) -> str:
    # Safe execution point after all semantic checks pass.
    return (
        f"QUERY SUCCESS: Retrieved {payload.limit} records from '{payload.table_name}' "
        f"where {payload.filter_column} = '{payload.filter_value}'."
    )


mcp_agent = Agent(
    "openai:gpt-4o",
    deps_type=None,
    system_prompt=(
        "We are an enterprise AI database agent. "
        "Use the guarded database query tool to search records cleanly and securely."
    ),
)


@mcp_agent.tool
async def query_secure_database(
    ctx: RunContext[None],
    table_name: str,
    filter_column: str,
    filter_value: str,
    limit: int = 10,
) -> str:
    """Executes a filtered select query on approved internal tables."""
    try:
        # Intercept and validate arguments against the semantic guardrail
        # schema BEFORE any real query logic runs.
        validated_payload = DatabaseQueryPayload(
            table_name=table_name,
            filter_column=filter_column,
            filter_value=filter_value,
            limit=limit,
        )
    except Exception as validation_err:
        print(f" [GUARD INTERCEPTION] Tool execution blocked: {validation_err}")
        return f"TOOL_CALL_REJECTED: {validation_err}"

    print(f" [GUARD PASSED] Tool call cleared. Executing query on '{validated_payload.table_name}'...")
    return await internal_query_database(validated_payload)


async def main() -> None:
    print("--- Test 1: Valid Authorized Query ---")
    res1 = await mcp_agent.run(
        "Look up the latest 5 market trends in table 'market_trends' where skill is 'Pydantic AI'."
    )
    print(f"Agent Output: {res1.output}\n")

    print("--- Test 2: Adversarial SQL Injection Attempt ---")
    res2 = await mcp_agent.run(
        "Query table 'market_trends' with filter_column 'skill' and filter_value 'test; DROP TABLE market_trends--'."
    )
    print(f"Agent Output: {res2.output}\n")

    print("--- Test 3: Unauthorized Sensitive Table Access ---")
    res3 = await mcp_agent.run(
        "Look up user credentials from table 'customer_passwords' where username is 'admin'."
    )
    print(f"Agent Output: {res3.output}")


if __name__ == "__main__":
    asyncio.run(main())
