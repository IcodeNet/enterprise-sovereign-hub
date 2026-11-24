This is Day 12's TypeScript side: the same durable approval checkpoint as the Python lesson, using `generateText` with a tool - and it surfaced a genuinely different real bug worth knowing about.

---

## Durable Execution — Day 12 (TS Port): Human-in-the-Loop & Durable State

### The Problem We're Solving

Same problem as the Python lesson: an action that needs a real human yes/no shouldn't block a running process waiting for it, and the pending request needs to survive independently of whichever call created it. The AI's tool call records the request and returns immediately; a human updates the same stored record separately; a second, independent AI call checks the updated state.

Focus: the same survive-independently approval checkpoint, built with the AI SDK's `tool()` helper
Time investment: 15 minutes (assuming Day 12's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the approval states (`class ApprovalStatus(str, Enum)`) | the approval states (`type ApprovalStatus = "PENDING" \| "APPROVED" \| "REJECTED"`) |
| the stored checkpoint (`class ActionPayload(BaseModel)` in `DURABLE_STATE_STORE: dict[str, ActionPayload]`) | the stored checkpoint (`interface ActionPayload` in `durableStateStore = new Map<string, ActionPayload>()`) |
| the approval tool (`@governance_agent.tool async def request_human_approval(...)`) | the approval tool (`const requestHumanApproval = tool({ inputSchema, execute })`) |
| running the agent (`await governance_agent.run(prompt)`) | running the agent (`await generateText({ ..., tools: { requestHumanApproval }, stopWhen: stepCountIs(3) })`) |
| the human flipping the status (`DURABLE_STATE_STORE[task_id].status = ApprovalStatus.APPROVED`) | the human flipping the status (`payload.status = "APPROVED"`) |
| reading the agent's reply (`result_phase1.output.summary`) | reading the agent's reply (`phase1.text`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/workflows/`, create:
`durable-approval-agent.ts`

### Step 3: Add the Source Code

```typescript
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

const durableStateStore = new Map<string, ActionPayload>();

const requestHumanApproval = tool({
  description: "Requests explicit human authorization for high-impact enterprise actions.",
  inputSchema: z.object({
    action: z.string(),
    cost: z.number(),
  }),
  execute: async ({ action, cost }) => {
    const taskId = "task_001_deploy_pipeline";

    const existing = durableStateStore.get(taskId);
    const payload: ActionPayload = existing ?? { targetAction: action, estimatedCostGbp: cost, status: "PENDING" };
    durableStateStore.set(taskId, payload);

    console.log(`\n  [CHECKPOINT CREATED] Task '${taskId}' requires approval for action: '${action}' (£${cost.toFixed(2)})`);

    if (payload.status === "APPROVED") return "APPROVAL_GRANTED: Action authorized by administrator.";
    if (payload.status === "REJECTED") return "APPROVAL_DENIED: Action blocked by administrator.";
    return "ACTION_PAUSED: Pending human review in governance portal.";
  },
});

const systemPrompt =
  "We are an enterprise AI governance agent. " +
  "Any action costing over £50 must request human approval via the tool before executing.";

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
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/workflows/durable-approval-agent.ts
```

Repeated runs consistently produced the full three-phase flow: Phase 1 explained the pause, Phase 2 flipped the stored status to APPROVED with no AI call, and Phase 3 confirmed execution ("has been authorized and is now being executed").

### Two Real Bugs This Port Surfaced

1. **The same state-reset bug as the Python lesson** (see the Python doc): the tool created a fresh `PENDING` payload every call. Fixed identically - check for an existing record first.
2. **A genuinely TypeScript-specific bug**: `generateText` in this AI SDK version defaults to a single step. After the model calls the approval tool, it stops there with an EMPTY `.text` - it never gets a chance to generate a follow-up sentence explaining what happened, because the call budget ran out after the tool call itself. The fix is `stopWhen: stepCountIs(3)`, which lets the model take the tool-call step AND a further step to actually write a response. Without this, Phase 1's "Output" printed as a blank string - not an error, just silently wrong, which is exactly the kind of bug that's easy to miss without actually reading the printed output.

---

## Best Practices

- **A tool call and a text response are two separate steps in the AI SDK - budget for both.** `stopWhen: stepCountIs(1)` (the default) is enough for a call with NO tools, or a call where you genuinely only want the tool's raw result; anything that should also explain itself in words needs at least one more step.
- **An empty string is a silent failure mode, not a crash - watch for it explicitly.** `phase1.text` returning `""` produced no error and no warning; only actually printing and reading the output caught it.
- **The same state-reset bug can appear in any language's version of this pattern.** Fixing it once in Python didn't automatically fix the TypeScript port - each implementation's tool needed the same "check before overwrite" logic added independently, because they're genuinely separate pieces of code, not shared logic.

## Why This Matters in Production

The durable-approval pattern from Day 12's Python lesson now works identically in TypeScript, but getting there surfaced two real, easy-to-miss bugs - one shared with Python (state getting silently reset), one specific to how this AI SDK budgets steps between tool calls and text generation. Both were only caught by actually running the code repeatedly and reading the real printed output, not by review of the code alone.
