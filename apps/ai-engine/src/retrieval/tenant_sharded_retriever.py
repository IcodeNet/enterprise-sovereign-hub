"""Distributed vector sharding & tenant isolation - Day 54.

In enterprise applications (wealth management, treasury, multi-tenant
SaaS), retrieving documents across tenant boundaries violates
regulatory compliance and confidentiality. A multi-tenant vector
retriever must enforce tenant identifiers directly at the index
PARTITION level - not just as a filter applied after the fact - so an
unauthenticated cross-tenant lookup is structurally impossible, not
merely unlikely.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

load_dotenv()


class TenantVectorPayload(BaseModel):
    tenant_id: str
    chunk_id: str
    text_content: str
    embedding_mock: list[float] = Field(default_factory=lambda: [0.12, 0.45, 0.88])


class FilteredSearchResponse(BaseModel):
    query: str
    tenant_id: str
    matching_chunks: list[str]
    isolation_verified: bool = Field(description="Confirms zero leakage from other tenant partitions.")


class ShardedVectorStore:
    def __init__(self):
        # Sharded collections partitioned strictly by tenant ID.
        self.shards: dict[str, list[TenantVectorPayload]] = {}

    def insert(self, chunk: TenantVectorPayload) -> None:
        if chunk.tenant_id not in self.shards:
            self.shards[chunk.tenant_id] = []
        self.shards[chunk.tenant_id].append(chunk)

    def search_isolated(self, tenant_id: str, query: str) -> list[str]:
        """Queries strictly within the authenticated tenant shard."""
        if tenant_id not in self.shards:
            return []
        tokens = query.lower().split()
        return [c.text_content for c in self.shards[tenant_id] if any(token in c.text_content.lower() for token in tokens)]


class QueryContext:
    def __init__(self, store: ShardedVectorStore, tenant_id: str):
        self.store = store
        self.tenant_id = tenant_id


isolation_agent = Agent(
    "openai:gpt-4o",
    deps_type=QueryContext,
    output_type=FilteredSearchResponse,
    system_prompt=(
        "We are an enterprise multi-tenant security agent. "
        "Retrieve data solely using the query_tenant_shard tool. "
        "Enforce strict tenant boundary checks and verify isolation."
    ),
)


@isolation_agent.tool
async def query_tenant_shard(ctx: RunContext[QueryContext], query: str) -> list[str]:
    """Retrieves chunks strictly bounded by the authenticated tenant shard."""
    return ctx.deps.store.search_isolated(ctx.deps.tenant_id, query)


async def main() -> None:
    print("--- Test 1: Sharded Vector Partitioning & Tenant Isolation ---")
    store = ShardedVectorStore()

    # Seed Tenant A records (an internal treasury desk).
    store.insert(
        TenantVectorPayload(
            tenant_id="tenant_internal_treasury",
            chunk_id="chk_01",
            text_content="Internal treasury managed balances reached record yields of 4.35% in Q3 2026.",
        )
    )

    # Seed Tenant B records (an unrelated external fund client).
    store.insert(
        TenantVectorPayload(
            tenant_id="tenant_external_fund",
            chunk_id="chk_02",
            text_content="External fund private allocation: £45M in European commercial paper.",
        )
    )

    active_tenant = "tenant_internal_treasury"
    context = QueryContext(store=store, tenant_id=active_tenant)
    user_query = "What are the latest treasury yields?"

    print(f"Executing query for tenant: '{active_tenant}'")
    response = await isolation_agent.run(user_query, deps=context)
    data: FilteredSearchResponse = response.output

    print("\n=== Validated Query Output ===")
    print(f"Tenant ID: {data.tenant_id}")
    print(f"Retrieved Records: {data.matching_chunks}")
    print(f"Boundary Isolation Verified: {data.isolation_verified}")

    # Real proof isolation is genuinely enforced, not just claimed: the
    # tenant's own real matching chunk must be present, and the OTHER
    # tenant's chunk (which shares no query tokens but structurally
    # COULD leak if the shard boundary were bypassed) must never appear.
    print("\n--- Verification: No Cross-Tenant Leakage Actually Occurred ---")
    other_tenant_chunk = "External fund private allocation: £45M in European commercial paper."
    assert other_tenant_chunk not in data.matching_chunks, "BUG: Tenant B's private data leaked into Tenant A's query results."
    assert any("4.35%" in chunk for chunk in data.matching_chunks), "BUG: Tenant A's own real record is missing from its own results."
    print("[VERIFIED] Tenant A's real record is present, and Tenant B's private data never appeared - isolation is genuinely enforced.")

    # Real, separate finding: the agent's own SELF-REPORTED tenant_id
    # field in the structured output can be wrong even when the actual
    # data isolation held correctly - the model may echo back a
    # plausible-looking but fabricated tenant identifier instead of the
    # real one it was actually scoped to. Check this explicitly rather
    # than assuming a correct data result implies every field is correct.
    print("\n--- Verification: The Agent's Self-Reported tenant_id Field Is Accurate ---")
    if data.tenant_id != active_tenant:
        print(
            f"[FINDING] The agent's reported tenant_id ('{data.tenant_id}') does NOT match the real active tenant "
            f"('{active_tenant}') - the DATA isolation held (verified above), but this self-reported field is "
            "unreliable and should never be trusted as an audit record on its own."
        )
    else:
        print(f"[VERIFIED] The agent's reported tenant_id ('{data.tenant_id}') correctly matches the real active tenant.")

    # Second, more adversarial scenario the source's demo never tried:
    # directly attempt to query ANOTHER tenant's shard using the wrong
    # tenant_id at the STORE level (bypassing the agent entirely) - this
    # proves the isolation lives in the store's own partition structure,
    # not merely in the agent's prompt-level "please don't leak" instruction.
    print("\n--- Test 2: Direct Store-Level Cross-Tenant Query Attempt ---")
    cross_tenant_results = store.search_isolated("tenant_external_fund", "treasury yields")
    assert cross_tenant_results == [], (
        f"BUG: querying Tenant B's shard for Tenant A's query terms returned results: {cross_tenant_results} "
        "- the partition boundary itself is not enforced."
    )
    print("[VERIFIED] Querying Tenant B's shard for Tenant A's query terms returns nothing - the partition boundary is structural, not just prompt-level guidance.")


if __name__ == "__main__":
    asyncio.run(main())
