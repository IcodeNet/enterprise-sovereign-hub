Day 47's TypeScript port builds the equivalent self-correction mechanism with a thrown tool error, and finds the OPPOSITE result to Python's bug: the corrected retry genuinely reports the right balance every time.

---

## Resilience & Self-Correction — Day 47 (TS Port): Self-Healing Dynamic Tool Correction

### The Problem We're Solving

Same problem as the Python lesson: a tool call with malformed arguments needs a graceful, model-driven correction path instead of a hard crash.

Focus: the AI SDK's equivalent correction mechanism (a thrown tool error, not a dedicated retry-exception class), and a genuine cross-language result difference
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the retry signal (`raise ModelRetry(message)`) | the retry signal (a normal thrown `Error` inside `execute()`) |
| the agent with tool access (`Agent("openai:gpt-4o", output_type=..., tools=[fetch_account_ledger])`) | the agent with tool access (`generateText({ model, tools: { fetchAccountLedger }, stopWhen: stepCountIs(4) })`) |
| producing the structured final answer (agent's own `output_type=QueryExecutionResult`) | producing the structured final answer (a second `generateObject` call extracting structure from the first call's free text) |
| direct verification of the correction firing (`await fetch_account_ledger(None, "not-a-valid-id")`) | direct verification of the correction firing (`validateAccountId("not-a-valid-id")`, the validation logic extracted so it's testable without going through the tool wrapper) |

### Step 1: Build the Tool

The AI SDK has no dedicated retry-exception class like `ModelRetry` - a normal thrown `Error` inside a tool's `execute()` becomes a tool-error result that gets fed back to the model, and `stopWhen: stepCountIs(4)` is what lets the model actually take another step to retry after seeing that error (same pattern as Day 12's `governance_agent` needing `stepCountIs` to continue past a tool call).

### Step 2: Run and Verify - The Opposite Result to Python

```
Submitting query: Please pull the balance for customer ledger account ' acc-4081 '.

=== Execution Verified & Self-Healed ===
Target Account: ACC-4081
Retrieved Balance: £124,500.50
Audit Log: No self-healing correction needed, balance was correctly retrieved.

[VERIFIED] Validation error raised as expected: Invalid account ID format: 'not-a-valid-id'. ...
```

Confirmed across 2 separate runs: TypeScript's version consistently reports the CORRECT retrieved balance (`£124,500.50`) after the same kind of correction Python's version also performs correctly on the account ID - but Python's version consistently reports `£0.00` for the same scenario across all 4 of its own runs. This is a genuine, reproducible cross-language difference in the same underlying pattern, not a flaky one-off on either side.

A plausible reason: this port's final structured answer comes from a SEPARATE `generateObject` call reading the full conversation transcript text (which includes the tool's real successful return value written out in the model's own words), rather than asking the SAME agent invocation that just experienced a correction to also recall the tool's numeric return value from earlier in its own context. Two different implementation shapes for "produce the structured final answer" may be exactly why this port didn't reproduce Python's bug.

---

## Best Practices

- **A cross-language port that DOESN'T reproduce the other language's bug is itself a real finding, not a shrug.** It's tempting to just report "the TS version works" and move on, but the interesting fact here is WHY it works when Python's more direct approach doesn't - the separate extraction step likely sidesteps whatever caused Python's model to lose track of its own tool result.
- **Extract testable validation logic (`validateAccountId`) out of the tool wrapper itself.** This let the direct verification call the real validation function without needing to reach into the AI SDK's internal `tool.execute()` calling convention (which requires extra, only-tangentially-relevant context arguments) - a cleaner test than fighting the framework's own call signature.

## Why This Port Matters in Production

Finding that two implementations of the "same" self-healing pattern produce genuinely different reliability on the exact numeric result is a real, concrete argument for why the FINAL step of an agentic pipeline (structuring the answer) deserves its own scrutiny, separate from whether the correction step itself worked. It's not enough to prove the pattern works once in one language - the specific architecture of how the final answer gets assembled can matter as much as the retry mechanism itself.
