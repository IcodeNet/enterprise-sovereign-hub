TypeScript port of Day 63 with the same runtime safety checks: a hard step limit and a per-step tool permission check before side effects.

What it's called in Python | What it's called in TypeScript
--- | ---
`LoopStatus` enum | `LoopStatus` union type
`LoopOutcome` dataclass | `LoopOutcome` interface
`run_bounded_loop(...)` | `runBoundedLoop(...)`
`TOOL_AUTHORITY: dict[str, set[str]]` | `TOOL_AUTHORITY: Record<string, Set<string>>`

---

## Resilience & Safety — Day 63 (TS Port): Bounded Agent Loop Budget & Step Authority

### The Problem We're Solving

Plain-English terms used in this lesson:

- "high autonomy" means the agent can take several tool steps on its own before asking a human.
- "policy-aligned" means each tool call matches the allow-list rules for that request intent.

If a tool loop has no hard step budget, a bad plan can keep running longer than intended.

If tool permission checks are not enforced at each step, the loop can still call tools that are out of scope for the request.

This port enforces both controls in one runtime path.

Focus: bounded autonomy with deterministic denial behavior
Time investment: 15 minutes

Attribution note:
- This lesson applies principles from Sam Bhagwat's "Principles of Building AI Agents" and pattern framing from "Patterns for Building AI Agents" (Sam Bhagwat and Michelle Gienow, mastra.ai): keep agent autonomy bounded, keep authority checks explicit, and verify safety outcomes with real runtime evidence.

### Step 1: Create the TypeScript lesson file

No new npm package was required for this day.

Create:

`apps/web/src/agents/agent-loop-budget.ts`

```typescript
/**
 * Bounded agent loop budget with per-step authority checks - Day 63 TS port.
 *
 * Goal: prevent runaway autonomous loops by enforcing max steps and tool
 * authority at each step.
 */

type LoopStatus = "completed" | "budget_exhausted" | "authority_denied";

interface LoopEvent {
  step: number;
  tool: string;
  outcome: string;
}

interface LoopOutcome {
  requestId: string;
  intent: string;
  status: LoopStatus;
  stepsExecuted: number;
  maxSteps: number;
  events: LoopEvent[];
  stoppedReason: string;
}

const TOOL_AUTHORITY: Record<string, Set<string>> = {
  faq: new Set(["retrieval_lookup", "policy_summary"]),
  account_data: new Set(["auth_check", "account_lookup"]),
  simulation: new Set(["auth_check", "account_lookup", "projection_calc"]),
};

function isAllowed(intent: string, tool: string): boolean {
  return TOOL_AUTHORITY[intent]?.has(tool) ?? false;
}

function executeTool(tool: string): string {
  return `ok:${tool}`;
}

function runBoundedLoop(
  requestId: string,
  intent: string,
  plannedTools: string[],
  maxSteps: number,
): LoopOutcome {
  const events: LoopEvent[] = [];
  let executedSteps = 0;

  for (let index = 0; index < plannedTools.length; index += 1) {
    const step = index + 1;
    const tool = plannedTools[index];

    if (step > maxSteps) {
      return {
        requestId,
        intent,
        status: "budget_exhausted",
        stepsExecuted: executedSteps,
        maxSteps,
        events,
        stoppedReason: `max_steps=${maxSteps} reached before ${tool}`,
      };
    }

    if (!isAllowed(intent, tool)) {
      events.push({ step, tool, outcome: "denied" });
      return {
        requestId,
        intent,
        status: "authority_denied",
        stepsExecuted: executedSteps,
        maxSteps,
        events,
        stoppedReason: `tool_not_allowed:${tool}`,
      };
    }

    const result = executeTool(tool);
    events.push({ step, tool, outcome: result });
    executedSteps += 1;
  }

  return {
    requestId,
    intent,
    status: "completed",
    stepsExecuted: executedSteps,
    maxSteps,
    events,
    stoppedReason: "completed",
  };
}

async function main(): Promise<void> {
  console.log("--- Test 1: Completed inside budget ---");
  let out = runBoundedLoop("req-6301", "simulation", ["auth_check", "projection_calc"], 3);
  console.log(
    `Result: status=${out.status}, steps_executed=${out.stepsExecuted}/${out.maxSteps}, reason=${out.stoppedReason}`,
  );
  if (!(out.status === "completed" && out.stepsExecuted === 2)) {
    throw new Error("Expected completed status with 2 steps");
  }
  console.log("[VERIFIED] Loop completed before budget and only allowed tools ran.");

  console.log("\n--- Test 2: Budget stops runaway plan ---");
  out = runBoundedLoop(
    "req-6302",
    "simulation",
    ["auth_check", "account_lookup", "projection_calc", "projection_calc"],
    3,
  );
  console.log(
    `Result: status=${out.status}, steps_executed=${out.stepsExecuted}/${out.maxSteps}, reason=${out.stoppedReason}`,
  );
  if (!(out.status === "budget_exhausted" && out.stepsExecuted === 3)) {
    throw new Error("Expected budget_exhausted after 3 executed steps");
  }
  console.log("[VERIFIED] Fourth step was blocked by max_steps before execution.");

  console.log("\n--- Test 3: Authority denies disallowed tool mid-loop ---");
  out = runBoundedLoop("req-6303", "faq", ["retrieval_lookup", "account_lookup"], 3);
  console.log(
    `Result: status=${out.status}, steps_executed=${out.stepsExecuted}/${out.maxSteps}, reason=${out.stoppedReason}`,
  );
  if (!(out.status === "authority_denied" && out.events.at(-1)?.outcome === "denied")) {
    throw new Error("Expected authority denial on disallowed tool");
  }
  if (out.stepsExecuted !== 1) {
    throw new Error("Expected one executed step before denial");
  }
  console.log("[VERIFIED] Disallowed tool was denied at the exact step it appeared.");

  console.log("\n--- Test 4: Empty plan ends cleanly ---");
  out = runBoundedLoop("req-6304", "faq", [], 3);
  console.log(
    `Result: status=${out.status}, steps_executed=${out.stepsExecuted}/${out.maxSteps}, reason=${out.stoppedReason}`,
  );
  if (!(out.status === "completed" && out.stepsExecuted === 0)) {
    throw new Error("Expected clean completion for empty plan");
  }
  console.log("[VERIFIED] Empty plan returns completed with zero steps.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
```

### Step 2: Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/agent-loop-budget.ts`

Output:

```text
--- Test 1: Completed inside budget ---
Result: status=completed, steps_executed=2/3, reason=completed
[VERIFIED] Loop completed before budget and only allowed tools ran.

--- Test 2: Budget stops runaway plan ---
Result: status=budget_exhausted, steps_executed=3/3, reason=max_steps=3 reached before projection_calc
[VERIFIED] Fourth step was blocked by max_steps before execution.

--- Test 3: Authority denies disallowed tool mid-loop ---
Result: status=authority_denied, steps_executed=1/3, reason=tool_not_allowed:account_lookup
[VERIFIED] Disallowed tool was denied at the exact step it appeared.

--- Test 4: Empty plan ends cleanly ---
Result: status=completed, steps_executed=0/3, reason=completed
[VERIFIED] Empty plan returns completed with zero steps.
```

Checks run:

- `cd apps/web && npx tsc --noEmit` -> pass
- `cd apps/web && npx oxfmt --check src/agents/agent-loop-budget.ts` -> pass
- `cd apps/web && npx oxlint src/agents/agent-loop-budget.ts` -> pass

## Best Practices

- Enforce both loop budget and authority at the same control point.
- Return explicit stop reasons so monitoring can classify failures correctly.
- Keep TypeScript and Python stop-condition semantics aligned to prevent cross-language drift.

## Why This Matters in Production

This pattern is a core guardrail for Eunomia runtime autonomy. It prevents runaway loops, blocks out-of-scope tools, and emits deterministic outcomes that can be audited in eval and incident workflows.
