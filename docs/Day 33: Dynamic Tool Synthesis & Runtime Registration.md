Day 33 gives an agent the ability to write, sandbox, and register a completely new tool at runtime - and finds a real bug where the model's own two output fields disagree with each other.

---

## Agent Autonomy — Day 33: Dynamic Tool Synthesis & Runtime Registration

### The Problem We're Solving

Predefined tools cannot cover every task. If no existing tool fits, the agent can build a new tool function during the same run, test it in an isolated namespace (a safe temporary code area), and then add it to the live tool registry. This avoids a restart and keeps the run moving.

Focus: a real dynamic tool-synthesis pipeline, and a genuine bug found where the model's own structured output fields contradict each other
Time investment: 15 minutes, plus a real defensive fix once the first run crashed

### Step 1: Build the Synthesis Pipeline and Registry

`apps/ai-engine/src/agents/dynamic_tool_synthesis.py` asks an agent to write a self-contained Python function for a missing capability, then compiles and registers it in an isolated namespace:

```python
class DynamicToolRegistry:
    def compile_and_register(self, code_payload: SynthesizedToolCode) -> None:
        local_scope: dict[str, Any] = {}
        exec(code_payload.python_code, {"__builtins__": __builtins__, "hashlib": hashlib}, local_scope)
        func = local_scope.get(code_payload.tool_name)
        ...
```

Same isolation discipline as Day 27's self-healing agent - a fresh namespace, not this module's own `globals()`.

### Step 2: A Real Bug on the First Run - the Model's Own Fields Disagree

The first real run crashed:

```
ValueError: Function Calculate_SHA256_Hash was not found in synthesized code.
```

The model's structured output had TWO fields that should have matched but didn't: `tool_name` was `"Calculate_SHA256_Hash"` (PascalCase, ignoring the schema's explicit "snake_case" instruction), while the actual function it wrote in `python_code` was `calculate_sha256_hash` (correctly snake_case). The model was internally inconsistent with itself - a real, reproducible structured-output bug, not a fluke.

**Fix**: don't trust the model's `tool_name` field as the source of truth for what got registered. If the claimed name isn't found, look at what the generated code ACTUALLY defined, and if there's exactly one real callable, use that instead:

```python
func = local_scope.get(code_payload.tool_name)
if not callable(func):
    candidates = [v for v in local_scope.values() if callable(v)]
    if len(candidates) == 1:
        func = candidates[0]
        print(f" [NAME MISMATCH RECOVERED] tool_name '{code_payload.tool_name}' didn't match "
              f"any defined function; found exactly one real callable instead: '{func.__name__}'.")
```

Re-run after the fix, with a genuinely different model response that ALSO mismatched (`"SHA-256 Hash Slicer"` vs the actual `calculate_sha256_first12`):

```
[NAME MISMATCH RECOVERED] tool_name 'SHA-256 Hash Slicer' didn't match any defined function; found exactly one real callable instead: 'calculate_sha256_first12'.
[TOOL REGISTERED] Successfully added 'calculate_sha256_first12' to runtime registry.

Step 3: Executing newly synthesized tool...
Runtime Execution Output: 510c0f8bcf62
```

Real, correct SHA-256 hash of the test input, first 12 characters, despite the model's stated tool name being wrong AGAIN on this run - confirming this isn't a one-off, it's a genuine, repeatable pattern worth defending against.

---

## Best Practices

- **Never trust a model's own metadata about its own output as gospel, even when the schema explicitly constrains it.** The `tool_name` field was explicitly described as "Snake_case function name" and the model still returned PascalCase, and separately, a display-style name unrelated to the actual identifier - twice, on two different runs. Structured output schemas reduce but don't eliminate this class of internal inconsistency.
- **When a model-generated identifier doesn't match, recover by inspecting what was ACTUALLY produced rather than failing immediately.** Finding "exactly one real callable" in the generated namespace is a safe, unambiguous recovery - it only works because there's exactly one candidate; if there were multiple, failing loudly is still the right call.
- **Reuse the isolation discipline already proven correct on an earlier day (Day 27's fresh-namespace `exec()`) rather than re-deriving it.** The security property (untrusted generated code can't touch this module's real state) matters exactly as much here as it did there.

## Why This Matters in Production

A model's structured output schema constrains the SHAPE of a response but not always its internal CONSISTENCY - two fields that are each individually valid can still contradict each other. Catching this by actually running the code (twice, with two different real mismatches) rather than assuming schema validation was sufficient is what surfaced a genuine, repeatable failure mode worth defending against in any system that trusts an LLM's own naming of its own generated artifacts.
