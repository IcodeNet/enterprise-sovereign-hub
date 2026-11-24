Day 48's TypeScript port builds the same runtime schema from a manifest using `z.object()` in place of `create_model()`, and reproduces the identical verified constraint-enforcement results.

---

## MCP & Dynamic Tooling — Day 48 (TS Port): Dynamic Tool Schema Introspection & MCP Tool Synthesis

### The Problem We're Solving

Same problem as the Python lesson: a tool discovered at runtime via MCP needs a genuinely validating schema built on the fly, not a hand-written static type known in advance.

Focus: building a `z.object()` schema from a manifest's field map, in place of `create_model(**fields)`
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the manifest's field map (`manifest["parameters"]: Dict[str, tuple[type, FieldInfo]]`) | the manifest's field map (`manifest.parameters: Record<string, z.ZodType>`) |
| the dynamic schema factory (`create_model(f"{tool_name}_Schema", **field_definitions)`) | the dynamic schema factory (`z.object(manifest.parameters)`) |
| running the tool-calling agent (`await mcp_bridge_agent.run(user_query)`) | running the tool-calling agent (`await generateText({ model, tools, stopWhen: stepCountIs(3), prompt })`) |
| testing a rejected out-of-range value (`DynamicBondInput(target_tenor_months=999)` raising `ValidationError`) | testing a rejected out-of-range value (`DynamicBondInputSchema.safeParse({ targetTenorMonths: 999 })` returning `success: false`) |

### Step 1: Build the Dynamic Schema Factory

Zod has no direct one-call equivalent of `create_model(**fields)`, but the same idea works just as well: build a `Record<string, z.ZodType>` from the manifest's own field definitions, then hand it to `z.object()` - the resulting schema is a genuine, fully-validating Zod type, built entirely at runtime from data that wasn't known at compile time.

### Step 2: Run and Verify - Identical Real Results

```
--- Test 1: Dynamic Schema Synthesis from a Valid MCP Manifest ---
[TOOL EXECUTED] Validated payload: {"benchmarkIsin":"GB00BM8Z2S21","targetTenorMonths":24,"includeSpread":true}
=== Agent Result ===
The bond yield for the benchmark ISIN GB00BM8Z2S21 over a 24-month duration is 4.12%.

--- Test 2: Directly Verifying the Synthesized Schema Rejects Invalid Input ---
[VERIFIED] Dynamically synthesized schema correctly rejected out-of-range input: ZodError

--- Test 3: Directly Verifying a Manifest-less Field Requires Explicit Value ---
[VERIFIED] includeSpread correctly required (no default in manifest): ZodError
```

Identical qualitative outcome to Python across all 3 tests: the happy path succeeds, the out-of-range value is rejected, and the field with no manifest-declared default is required. `tsc --noEmit` and `oxlint` both clean with no fixes needed this time. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **`z.object(fieldMap)` is a genuinely direct, one-line equivalent of `create_model(**fields)` for this specific use case** - no extra library or workaround needed, because Zod object schemas are already just plain objects mapping field name to type, which is exactly the shape a manifest's own parameter list naturally produces.
- **The same two direct-verification tests (reject out-of-range, require the no-default field) needed no adaptation between languages** - both `.safeParse()` and Pydantic's constructor-raises-`ValidationError` model the same "prove the constraint is real" check, just with a different calling convention (`safeParse` returns a result object rather than throwing).

## Why This Port Matters in Production

Confirming the SAME direct-verification tests pass identically on a schema built by a completely different runtime-schema-construction mechanism (`z.object()` vs `create_model()`) is real, concrete proof that "build a validating schema from a manifest discovered at runtime" is a portable pattern, not something that happens to work because of a Pydantic-specific quirk.
