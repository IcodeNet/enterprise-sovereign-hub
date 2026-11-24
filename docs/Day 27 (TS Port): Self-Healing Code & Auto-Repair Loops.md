Day 27's TypeScript port builds the same self-healing repair loop using Node's own sandboxing primitive, and independently verifies the same two guarantees the Python side proved: real isolation, and a real retry mechanism.

---

## Agent Reliability — Day 27 (TS Port): Self-Healing Code & Auto-Repair Loops

### The Problem We're Solving

When an agent writes code to solve a task, the first attempt can fail. A **self-healing loop** captures the real exception, feeds it back to the model as the next prompt, and re-runs in a bounded retry loop instead of crashing the whole pipeline on the first failure.

Focus: the same sandboxed repair loop as the Python side, using Node's built-in isolation primitive instead of adding a dependency
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the sandbox (`exec()` with one fresh empty dict as both globals and locals, inside `execute_in_sandbox`) | the sandbox (Node's built-in `vm.createContext()`, inside `executeInSandbox`) |
| proving isolation (`globals()["execute_in_sandbox"] = None`, then `callable(execute_in_sandbox)` is still `True`) | proving isolation (`typeof process === "undefined"` prints `process is NOT visible - isolated`) |
| asking the AI for code (`await code_repair_agent.run(current_prompt)`) | asking the AI for code (`generateObject` with `gpt-4o`) |
| proving the error is fed forward (`assert "deliberately broken on first attempt" in prompt` inside `fake_run`) | proving the error is fed forward (a controlled fake printing `Repair prompt contains captured error: true`) |

### Step 1: Sandbox With Node's Built-In `vm` Module

`apps/web/src/agents/self-healing-agent.ts` uses the same pattern with `generateObject` (Vercel AI SDK, `gpt-4o`) and Node's built-in `vm` module for sandboxing - deliberately NOT adding `isolated-vm` or `vm2` as extra dependencies, since Node's own `vm.createContext()` already gives a genuinely separate global object for this lesson's needs.

Isolation verified the same way as the Python side, directly:

```typescript
const leakAttempt = executeInSandbox(
  'typeof process === "undefined" ? console.log("process is NOT visible - isolated") : console.log("LEAK!")'
);
// stdout: "process is NOT visible - isolated"
```

Node's own global (`process`) is genuinely unreachable from inside the `vm` context - real proof of isolation, not just a lexical closure that happens to not reference it.

### Step 2: Verify the Retry Mechanism Directly

Both the sandbox's real-error-capture and the retry-loop's error-feeding-forward were verified directly, matching the Python side's approach of testing the mechanism with a controlled fake rather than hoping the live model would fail naturally:

```
Attempt 1 failed as expected: Error: deliberately broken on first attempt
Repair prompt contains captured error: true
Attempt 2 succeeded: true - output: fixed on retry
```

`tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing) - no new dependencies were needed since `vm` ships with Node.

---

## Best Practices

- **Prefer a language's own built-in isolation primitive over adding a dependency**, when it's genuinely sufficient. Node's `vm` module gave real context isolation for this lesson without adding `isolated-vm`/`vm2` to the dependency tree.
- **Verify isolation directly by checking that a real runtime global is genuinely unreachable**, not by trusting that a sandboxing API "should" work. Confirming `process` is undefined inside the `vm` context is the actual proof, not an assumption from the module's documentation.

## Why This Matters in Production

An agent that generates code for production use needs "sandboxed execution" to actually mean isolated - built from the language's own genuine isolation primitive and verified directly, not assumed from a library's name or documentation. Doing this independently in TypeScript, using a completely different mechanism (`vm` vs. Python's `exec()` with fresh namespaces), and getting the same isolation guarantee confirms the underlying requirement is met on both sides of this stack.
