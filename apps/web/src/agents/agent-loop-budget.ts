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
