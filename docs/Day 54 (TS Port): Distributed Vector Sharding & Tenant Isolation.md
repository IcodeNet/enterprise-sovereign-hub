Day 54's TypeScript port builds the identical partitioned store, and shows WHY its architecture avoided Python's self-reported-`tenantId` bug: this port's extraction prompt explicitly supplies the real tenant ID rather than asking the model to recall and echo it.

---

## Security & Guardrails — Day 54 (TS Port): Distributed Vector Sharding & Tenant Isolation

### The Problem We're Solving

Same problem as the Python lesson: tenant boundaries need to be enforced at the storage PARTITION level, structurally, not as an after-the-fact filter.

Focus: the same partitioned `Map`-based store, plus an architectural difference that avoided Python's metadata-accuracy bug
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the partitioned store (`self.shards: Dict[str, List[TenantVectorPayload]]`) | the partitioned store (`private readonly shards = new Map<string, TenantVectorPayload[]>()`) |
| the isolated query (`search_isolated(tenant_id, query)`) | the isolated query (`searchIsolated(tenantId, query)`) |
| the agent's self-reported result (agent's own `output_type=FilteredSearchResponse`, asked to recall `tenant_id` from context) | the agent's self-reported result (a separate `generateObject` extraction, EXPLICITLY told the real `tenantId` in its own prompt) |

### Step 1: Build the Partitioned Store

Structurally identical to Python: a `Map` keyed by tenant ID, with `searchIsolated()` only ever reading from the ONE matching shard.

### Step 2: Run and Verify - Isolation Holds, and the Metadata Bug Doesn't Reproduce Here

```
=== Validated Query Output ===
Tenant ID: tenant_internal_treasury
Retrieved Records: ["Internal treasury managed balances reached record yields of 4.35% in Q3 2026."]
Boundary Isolation Verified: true

[VERIFIED] Tenant A's real record is present, and Tenant B's private data never appeared - isolation is genuinely enforced.
[VERIFIED] The agent's reported tenantId ('tenant_internal_treasury') correctly matches the real active tenant.

--- Test 2: Direct Store-Level Cross-Tenant Query Attempt ---
[VERIFIED] Querying Tenant B's shard for Tenant A's query terms returns nothing - the partition boundary is structural, not just prompt-level guidance.
```

Both real isolation checks pass identically to Python. But Python's finding (a fabricated `tenant_id` field) did NOT reproduce here - and the reason is architectural, not luck: this port's extraction step explicitly PASSES the real `activeTenantId` into the `generateObject` prompt as known ground truth, rather than asking the model to recall which tenant it was scoped to from earlier in its own context (the same class of "trust the caller's own record, don't ask the model to remember it" fix used in Day 47's and Day 50's ports).

---

## Best Practices

- **When a downstream extraction step needs a value the CALLER already knows for certain (like which tenant authenticated this request), pass it in explicitly rather than asking the model to recall and echo it.** This is the direct, structural fix for the exact class of bug Python's version exhibited - not a coincidence, but the reason this port's architecture didn't reproduce it.
- **A bug that doesn't reproduce in a second implementation is worth explaining, not just noting.** "It works here" is a weaker finding than "it works here BECAUSE this port's extraction step supplies the ground-truth value directly, sidestepping the exact mechanism that caused Python's bug."

## Why This Port Matters in Production

This is a genuinely useful comparison: the SAME underlying isolation guarantee (verified identically in both languages) paired with a DIFFERENT reliability outcome on a related metadata field, traceable to a specific, nameable architectural choice (supply the ground truth explicitly vs. ask the model to recall it). That's a concrete, actionable lesson for any pipeline assembling a structured answer from pieces the caller already knows for certain.
