Day 48 builds a validated tool schema at runtime from a discovered MCP manifest instead of a hand-written static type, and proves the runtime-built schema's own validation constraints genuinely work - not just the happy path the source's own demo stopped at.

---

## MCP & Dynamic Tooling — Day 48: Dynamic Tool Schema Introspection & MCP Tool Synthesis

### The Problem We're Solving

Large multi-agent platforms can't hard-code every tool schema ahead of time. As new microservices or database connectors come online via the Model Context Protocol (MCP - a standard way for an AI agent to discover and call external tools), the agent needs to inspect that tool's manifest (its declared parameters, types, and constraints) at runtime, synthesize a validated schema on the fly, and invoke the tool with full type safety - all without a developer writing a static class for that specific tool ahead of time.

Focus: `pydantic.create_model()` building a real validated class at runtime, plus proving its constraints actually hold
Time investment: 15 minutes

### Step 1: Build the Dynamic Schema Factory

`apps/ai-engine/src/mcp/dynamic_tool_synthesizer.py` simulates a manifest discovered from an external MCP server (in a real system this would come from that server's own `tools/list` response) and compiles it into a genuine Pydantic model at runtime:

```python
def build_dynamic_schema(manifest: dict) -> type[BaseModel]:
    """Dynamically compiles a validated Pydantic model from an MCP parameter schema."""
    field_definitions = manifest["parameters"]
    return create_model(f"{manifest['tool_name']}_Schema", **field_definitions)

DynamicBondInput = build_dynamic_schema(mcp_tool_manifest)
```

### Step 2: Verify the Synthesized Schema's Constraints Actually Work

The source's own demo only ever ran the happy path - a well-formed request that the agent handles correctly. Added two direct tests against the dynamically-built class itself: one that feeds it an out-of-range value (`target_tenor_months=999`, when the manifest declares `ge=1, le=360`), and one that omits a required field entirely (`include_spread`, which the manifest declares with no default).

### Step 3: Run and Verify - All 3, Real Results

```
--- Test 1: Dynamic Schema Synthesis from a Valid MCP Manifest ---
[TOOL EXECUTED] Validated payload: {"benchmark_isin":"GB00BM8Z2S21","target_tenor_months":24,"include_spread":true}
=== Agent Result ===
The calculated bond yield for benchmark ISIN GB00BM8Z2S21 over a 24-month duration is 4.12%, inclusive of the credit spread.

--- Test 2: Directly Verifying the Synthesized Schema Rejects Invalid Input ---
[VERIFIED] Dynamically synthesized schema correctly rejected out-of-range input: ValidationError

--- Test 3: Directly Verifying a Manifest-less Field Requires Explicit Value ---
[VERIFIED] include_spread correctly required (no default in manifest): ValidationError
```

All 3 fully pass: the happy path correctly invokes the agent with the runtime-built class, and the class's OWN declared constraints (`ge=1, le=360`, no default) are enforced exactly as if it had been written by hand ahead of time - proving `create_model` produces a fully real, fully validating Pydantic class, not a cosmetic stand-in.

---

## Best Practices

- **Test the constraints ON the dynamically-built class directly, separate from testing the agent that uses it.** The happy-path agent run alone can't distinguish "the schema genuinely validates" from "the model happened to produce well-formed arguments this time" - calling the class directly with deliberately bad data is what actually proves the constraint logic survived being built at runtime.
- **A manifest's declared constraints (`ge=`, `le=`, no default) need to be genuinely enforced, not just decorative type hints.** Since the whole point of this pattern is trusting a schema you didn't write by hand, its validation is the ONLY safety net left - if it silently accepted out-of-range input, nothing downstream would catch it either.

## Why This Matters in Production

A schema built from a manifest discovered at runtime is only as trustworthy as the proof that its declared rules actually run - and that proof has to come from testing the manifest-derived rules directly, not from watching one polished agent conversation go well. This is the same discipline Day 33's tool-name-mismatch bug and Day 44's guardrail tests both required: runtime-synthesized code and runtime-synthesized schemas both need their OWN direct verification, independent of whatever narrative the model wraps around them.
