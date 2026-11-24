import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Grounded self-reflection with transactional state rollback - Day 43 TS port.
 *
 * Snapshots state before each attempt, generates a candidate, has an
 * independent critic evaluate it against explicit invariants, and rolls
 * back to the pre-attempt snapshot if it fails - rather than letting a
 * rejected draft ever touch committed state.
 */

const SystemDesignDraftSchema = z.object({
  componentName: z.string(),
  codeSnippet: z.string().describe("Executable TypeScript snippet."),
  hasRetryLogic: z.boolean(),
  usesTypeHints: z.boolean(),
});

const CritiqueVerdictSchema = z.object({
  passed: z.boolean().describe("True only if all enterprise quality invariants pass."),
  score: z.number().describe("Score between 1 and 10."),
  feedback: z.string().describe("Actionable diagnostic feedback for the generator."),
});

class TransactionalSessionState {
  committedHistory: string[] = [];
  private snapshot: string[] | null = null;

  createCheckpoint(): void {
    this.snapshot = [...this.committedHistory];
    console.log(" [CHECKPOINT] Created state snapshot.");
  }

  rollback(): void {
    if (this.snapshot !== null) {
      this.committedHistory = [...this.snapshot];
      console.log(" [ROLLBACK] Reverted memory state to pre-transaction checkpoint.");
    }
  }

  commit(finalEntry: string): void {
    this.committedHistory.push(finalEntry);
    this.snapshot = null;
    console.log(" [TRANSACTION COMMITTED] Output approved and state updated.");
  }
}

async function generateDraft(prompt: string) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SystemDesignDraftSchema,
    system:
      "We are an autonomous software generation agent. Write robust, typed TypeScript components " +
      "based on user requirements and iterative critique.",
    prompt,
  });
  return object;
}

async function critiqueDraft(reviewPrompt: string) {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: CritiqueVerdictSchema,
    system:
      "We are a principal code review auditor. Enforce strict standards: " +
      "1. Must include explicit type annotations on all parameters and returns. " +
      "2. Must include explicit error handling or retry logic. Reject any code that fails these criteria.",
    prompt: reviewPrompt,
  });
  return object;
}

async function runReflectionLoop(task: string, maxIterations = 3) {
  const state = new TransactionalSessionState();
  state.createCheckpoint();

  let currentPrompt = `Design a TypeScript component for: ${task}`;
  let critiqueFeedback: string | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n--- Reflection Loop Turn ${iteration}/${maxIterations} ---`);

    if (critiqueFeedback) {
      currentPrompt += `\n\nPrevious draft was rejected with feedback:\n${critiqueFeedback}\nFix these issues.`;
    }

    const draft = await generateDraft(currentPrompt);
    console.log(`Generated Component: '${draft.componentName}'`);

    const reviewPrompt =
      `Component Name: ${draft.componentName}\n` +
      `Code:\n${draft.codeSnippet}\n` +
      `Reported Retry Logic: ${draft.hasRetryLogic}\n` +
      `Reported Type Hints: ${draft.usesTypeHints}`;
    const verdict = await critiqueDraft(reviewPrompt);

    console.log(`Critic Review: Passed=${verdict.passed} | Score=${verdict.score}/10`);
    console.log(`Feedback: ${verdict.feedback}`);

    if (verdict.passed) {
      state.commit(`Component: ${draft.componentName} deployed successfully.`);
      return draft;
    } else {
      state.rollback();
      critiqueFeedback = verdict.feedback;
    }
  }

  throw new Error("Failed to satisfy quality standards within maximum iterations.");
}

async function main(): Promise<void> {
  const task = "A resilient Redis caching client with exponential backoff on connection timeout.";
  const result = await runReflectionLoop(task, 3);
  console.log("\n=== Verified Component Approved ===");
  console.log(`Name: ${result.componentName}`);
  console.log(`Snippet:\n${result.codeSnippet}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
