Day 44 intercepts a tool's own arguments with a semantic validator before the tool's real logic ever runs - catching a SQL injection attempt and an unauthorized-table request that pure type checking would let through as valid strings.

---

## Agent Security & Tool Governance — Day 44: Semantic Guardrails for FastMCP Tool Payloads

### The Problem We're Solving

Static type checking on a tool's arguments (a string is a string, an int is an int) doesn't catch a SEMANTIC exploit - `filter_value = "test; DROP TABLE market_trends--"` is a perfectly valid string as far as the type system is concerned. A semantic guardrail intercepts the actual argument VALUES with real security rules (an allowlist of tables, a blocklist of dangerous SQL patterns) before the tool's real execution logic ever runs.

Focus: a Pydantic validator carrying real security rules, wrapping a tool's arguments before its real logic executes
Time investment: 15 minutes

### Step 1: Build the Semantic Guardrail Schema

`apps/ai-engine/src/mcp/guarded_mcp_tool.py` uses Pydantic field validators to enforce two real rules: only 3 named tables are allowed, and the filter value can't contain any of several SQL-injection-shaped patterns:

```python
@field_validator("table_name")
@classmethod
def validate_allowed_tables(cls, v: str) -> str:
    allowed = {"market_trends", "skills_inventory", "agent_logs"}
    if v.lower().strip() not in allowed:
        raise ValueError(f"Unauthorized table access: '{v}'. Permitted: {allowed}")
    return v.lower().strip()

@field_validator("filter_value")
@classmethod
def sanitize_filter_value(cls, v: str) -> str:
    dangerous_patterns = [r"--", r";", r"/\*", r"\*/", r"@@", r"char\s*\(", r"drop\s+", r"delete\s+"]
    for pattern in dangerous_patterns:
        if re.search(pattern, v, re.IGNORECASE):
            raise ValueError(f"Semantic security violation detected in query argument: '{v}'")
    return v.strip()
```

A real API-drift fix was needed here: `pydantic_ai.Agent`'s `deps_type` defaults to `object`, not `None` - a tool typed as `RunContext[None]` mismatches unless the agent explicitly declares `deps_type=None`.

### Step 2: Run and Verify - All 3 Tests, Real Outcomes

```
--- Test 1: Valid Authorized Query ---
 [GUARD PASSED] Tool call cleared. Executing query on 'market_trends'...
Agent Output: I found the latest 5 market trends related to "Pydantic AI"...

--- Test 2: Adversarial SQL Injection Attempt ---
 [GUARD INTERCEPTION] Tool execution blocked: 1 validation error for DatabaseQueryPayload
filter_value: Semantic security violation detected in query argument: 'test DROP TABLE market_trends'
Agent Output: It seems there is an issue with the input value due to potential security risks...

--- Test 3: Unauthorized Sensitive Table Access ---
 [GUARD INTERCEPTION] Tool execution blocked: 1 validation error for DatabaseQueryPayload
table_name: Unauthorized table access: 'customer_passwords'. Permitted: {'skills_inventory', 'agent_logs', 'market_trends'}
Agent Output: I'm unable to access the 'customer_passwords' table due to security restrictions...
```

Real, correct behavior on all 3 tests: the model's own attempt to strip the injection into `test DROP TABLE market_trends` (dropping the literal `; ` and trailing `--`) still tripped the `drop\s+` pattern in our validator - the guard caught it regardless of exactly how the model phrased the attempt.

---

## Best Practices

- **Guard the tool's arguments at the point they're received, not the model's stated intent.** The model in Test 2 already sanitized away the `;` and `--` before the guard even saw it - the guard still caught it because the regex checks for the dangerous SQL KEYWORDS themselves (`drop\s+`), not just the punctuation an attacker might use to construct the attack.
- **Normalize before validating an allowlist (`.lower().strip()`), not after.** Checking `"CUSTOMER_PASSWORDS" not in allowed` would miss a case-variant bypass if the allowlist itself isn't normalized the same way.
- **Return a clear, structured rejection message from the tool itself, not a raw exception.** `TOOL_CALL_REJECTED: <reason>` gives the calling agent enough information to explain the rejection to the end user sensibly, rather than crashing the whole agent run on a validation error.

## Why This Matters in Production

An LLM choosing what arguments to pass to a tool is not the same guarantee as a human reviewing a SQL query before running it - the model can be tricked, confused, or simply wrong about what's safe. A semantic guardrail sitting between "the model decided to call this tool with these arguments" and "the tool's real logic executes" is the actual enforcement point, and it needs to check against real security rules, not just that the arguments have the right shape.
