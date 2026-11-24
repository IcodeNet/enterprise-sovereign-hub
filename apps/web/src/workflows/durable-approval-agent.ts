import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

interface ActionPayload {
  targetAction: string;
  estimatedCostGbp: number;
  status: ApprovalStatus;
}

// A simulated durable state store: a plain Map standing in for what a real
// deployment would persist to a database via a durable-execution engine.
// The IMPORTANT property this simulates is that the pending action
// survives independently of the AI call that created it - a human can
// inspect and change `status` on their own schedule, without the original
// call needing to stay alive waiting for them.
const durableStateStore = new Map<string, ActionPayload>();

// A tool the model can call when it decides an action needs sign-off. This
// tool doesn't actually block and wait for a human - it records the
// request and returns immediately, reporting whatever the CURRENT status
// happens to be.
const requestHumanApproval = tool({
  description: "Requests explicit human authorization for high-impact enterprise actions.",
  inputSchema: z.object({
    action: z.string(),
    cost: z.number(),
  }),
  execute: async ({ action, cost }) => {
    const taskId = "task_001_deploy_pipeline";

    // Reuse the existing payload's status if this task was already
    // recorded - otherwise calling this tool a second time (e.g. once
    // execution actually resumes) would silently reset an already-approved
    // action back to PENDING, discarding the human's decision.
    const existing = durableStateStore.get(taskId);
    const payload: ActionPayload = existing ?? {
      targetAction: action,
      estimatedCostGbp: cost,
      status: "PENDING",
    };
    durableStateStore.set(taskId, payload);

    console.log(
      `\n  [CHECKPOINT CREATED] Task '${taskId}' requires approval for action: '${action}' (£${cost.toFixed(2)})`,
    );

    if (payload.status === "APPROVED")
      return "APPROVAL_GRANTED: Action authorized by administrator.";
    if (payload.status === "REJECTED") return "APPROVAL_DENIED: Action blocked by administrator.";
    return "ACTION_PAUSED: Pending human review in governance portal.";
  },
});

const systemPrompt =
  "We are an enterprise AI governance agent. " +
  "Any action costing over £50 must request human approval via the tool before executing.";

// Runs the three-phase demonstration: the model requests approval and
// necessarily pauses (Phase 1), a human approves out-of-band (Phase 2, no
// AI call at all), then the model is invoked AGAIN with a fresh prompt
// telling it the state has changed (Phase 3) - a second, independent call,
// not a resumed one.
async function runDurableWorkflow() {
  const prompt = "Deploy our new AI model fine-tuning job which costs £120.00.";

  console.log("--- Phase 1: Initial Agent Execution ---");
  const phase1 = await generateText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    prompt,
    tools: { requestHumanApproval },
    stopWhen: stepCountIs(3),
  });
  console.log(`Phase 1 Output: ${phase1.text}`);

  console.log("\n--- Phase 2: Human Operator Intervenes ---");
  const taskId = "task_001_deploy_pipeline";
  const payload = durableStateStore.get(taskId);
  if (payload) {
    console.log(`Human Operator inspecting task: ${payload.targetAction}`);
    payload.status = "APPROVED";
    console.log(`Human Operator updated status to: ${payload.status}`);
  }

  console.log("\n--- Phase 3: Resuming Workflow with Approved State ---");
  const phase2 = await generateText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    prompt: `Human approval status is now APPROVED for deploying "${payload?.targetAction}" at £${payload?.estimatedCostGbp.toFixed(2)}. Proceed with execution and confirm.`,
    tools: { requestHumanApproval },
    stopWhen: stepCountIs(3),
  });

  console.log(`Phase 2 Output: ${phase2.text}`);
}

runDurableWorkflow().catch(console.error);
