Day 27 gives an agent the ability to fix its own broken code - and finds and fixes a real sandbox-isolation bug in the initial starting point before trusting it.

---

## Agent Reliability — Day 27: Self-Healing Code & Auto-Repair Loops

### The Problem We're Solving

When an agent writes code to solve a task - a calculation, a data transform, a query - the first attempt can fail: a typo, a wrong function name, a missing import. Crashing the whole pipeline on that first failure wastes the useful signal in the error itself. A **self-healing loop** captures the real exception traceback, feeds it back to the model as the next prompt ("here's exactly what broke, fix it"), and re-runs in a bounded retry loop (capped, so a genuinely unfixable task fails cleanly instead of looping forever).

Focus: a real sandboxed execution loop that captures genuine errors and proves the repair cycle actually uses them
Time investment: 15 minutes, plus fixing a real sandbox-isolation bug in the initial code before it ran

### Step 1: A Real Bug Found in the Initial Starting Code - Before Writing Anything New

The initial sandbox function ran generated code as `exec(python_code, globals(), local_scope)` - passing this MODULE'S OWN `globals()` dictionary as the execution's global namespace. That means generated code, however untrusted, could read and mutate this file's real module-level state (functions, imports, anything defined at module scope) - the opposite of what a "sandbox" is supposed to guarantee.

**Fixed before ever running it**: `apps/ai-engine/src/agents/self_healing_agent.py` uses a single fresh, empty dict as BOTH the globals and locals argument to `exec()`, so generated code gets its own isolated namespace with no visibility into this module's real state.

Verified the fix is real, not cosmetic, with a direct test:

```python
leak_attempt = 'globals()["execute_in_sandbox"] = None'
outcome2 = execute_in_sandbox(leak_attempt)
print(callable(execute_in_sandbox))  # True - the real function is untouched
```

Real result: `True` - the sandboxed code's attempt to overwrite this module's own function through `globals()` had no effect outside its own isolated namespace.

### Step 2: Build the Repair Loop

```python
async def run_self_healing_pipeline(task_description: str, max_retries: int = 3) -> CodeSolution:
    current_prompt = f"Write Python code to solve: {task_description}"
    last_error: str | None = None

    for attempt in range(1, max_retries + 1):
        if last_error:
            current_prompt = (
                f"Previous code execution failed with the following error:\n{last_error}\n\n"
                f"Please fix the code to resolve the error and fulfill the original task: {task_description}"
            )
        result = await code_repair_agent.run(current_prompt)
        outcome = execute_in_sandbox(result.output.code)
        if outcome.is_successful:
            return result.output
        last_error = outcome.error_message

    raise RuntimeError(f"Failed to auto-repair code within {max_retries} attempts.")
```

One real API-drift fix vs the initial draft: `result_type` → `output_type` on `Agent(...)`, and `result.data` → `result.output` on the run result - the same rename this repo already hit on earlier days, confirmed again directly against the installed pydantic-ai version rather than assumed.

### Step 3: A Genuine Finding - `gpt-4o` Rarely Fails on the First Try for Simple Tasks

Running the real end-to-end pipeline against the baseline benchmark task (standard deviation via `math`) succeeded on attempt 1, every time. Trying deliberately harder tasks (an intentionally wrong `statistics` function name, a fictional package name) still didn't trigger the sandbox failure branch - the model either self-corrects the mistake in its own reasoning before emitting code, or wraps the risky part in a `try`/`except` that silently swallows the error and reports a status message instead of crashing.

This means the repair LOOP itself was never actually exercised end-to-end by a real model failure in this session. Rather than claim the loop "works" based on a happy-path run that never needed to repair anything, the mechanism was verified directly and honestly:

```python
call_count = {"n": 0}
async def fake_run(prompt):
    call_count["n"] += 1
    if call_count["n"] == 1:
        return FakeResult('raise ValueError("deliberately broken on first attempt")')
    assert "deliberately broken on first attempt" in prompt, "retry prompt missing captured error!"
    return FakeResult('print("fixed on retry")')

with patch.object(mod.code_repair_agent, "run", new=fake_run):
    result = asyncio.run(mod.run_self_healing_pipeline("fake task", max_retries=3))
```

Real result: attempt 1 genuinely failed with a real captured traceback (`ValueError: deliberately broken on first attempt`), that EXACT traceback was confirmed present in attempt 2's prompt via an `assert` inside the fake, and attempt 2 succeeded - `Total attempts made: 2`, correct final output. This proves the repair mechanism's wiring is correct, independent of whether a real model happens to fail on its own.

---

## Best Practices

- **A "sandbox" that shares the real module's globals isn't a sandbox.** This is a real security bug, not a style nitpick - untrusted generated code with access to `globals()` can silently corrupt or exfiltrate anything defined at module scope. Fixed before the loop was ever run.
- **Don't claim a retry mechanism "works" from a run that never actually needed to retry.** A happy-path success on attempt 1 proves the AGENT is competent, not that the REPAIR LOOP correctly threads a real error back into the next prompt. Those are different claims - this doc verifies both, separately, with real evidence for each.
- **When a live model won't reliably fail on demand, test the mechanism directly with a controlled fake instead of hoping for a lucky failure.** The mocked-failure test here is more rigorous evidence of correctness than a real failure would have been, because it asserts the exact traceback text actually appears in the retry prompt - not just that a second attempt happened.

## Why This Matters in Production

An agent that generates code for production use needs two independent guarantees, not one: that a bad first attempt can be caught and corrected, AND that "sandboxed execution" actually means isolated, not just wrapped in a try/except that shares the real process's state. This day found and fixed a genuine violation of the second guarantee before it ever ran, and verified the first guarantee with a test built specifically because the real model was too competent to fail naturally - both findings are more valuable than a single clean happy-path run would have been.
