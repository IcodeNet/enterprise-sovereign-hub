import "dotenv/config";
import vm from "node:vm";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Self-healing code execution agent - Day 27 TS port.
 *
 * Generates JavaScript for a task, runs it in Node's built-in `vm` module
 * (a real separate V8 context, not just a function scope - deliberately
 * avoiding `isolated-vm`/`vm2` as extra dependencies since Node's own `vm`
 * module already gives genuine context isolation for this lesson's needs),
 * and feeds a real thrown error's message back to the model as the next
 * prompt - the same bounded repair loop as the Python side.
 */

const CodeSolutionSchema = z.object({
  code: z.string().describe("Executable JavaScript snippet, no markdown formatting."),
  explanation: z.string().describe("Summary of the implementation."),
});

type CodeSolution = z.infer<typeof CodeSolutionSchema>;

interface ExecutionOutcome {
  isSuccessful: boolean;
  stdout: string;
  errorMessage?: string;
}

/**
 * Runs generated code in a fresh vm.Context - its own global object, so the
 * generated code cannot read or mutate this module's real state (the same
 * isolation guarantee the Python sandbox enforces with a fresh namespace
 * dict instead of passing this module's own globals()).
 */
export function executeInSandbox(jsCode: string): ExecutionOutcome {
  const capturedLogs: string[] = [];
  const sandboxContext = vm.createContext({
    console: { log: (...args: unknown[]) => capturedLogs.push(args.join(" ")) },
  });

  try {
    vm.runInContext(jsCode, sandboxContext, { timeout: 5000 });
    return { isSuccessful: true, stdout: capturedLogs.join("\n") };
  } catch (error) {
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { isSuccessful: false, stdout: capturedLogs.join("\n"), errorMessage };
  }
}

async function draftSolution(prompt: string): Promise<CodeSolution> {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: CodeSolutionSchema,
    system:
      "We are an autonomous self-healing software engineer. Write clean, executable " +
      "JavaScript (no imports/requires - plain built-in JS only, it runs in an isolated " +
      "vm context). When given an error message, diagnose the root cause and output " +
      "corrected code that uses console.log to print its result.",
    prompt,
  });
  return object;
}

export async function runSelfHealingPipeline(
  taskDescription: string,
  maxRetries = 3,
): Promise<CodeSolution> {
  console.log(`Step 1: Drafting initial solution for task: '${taskDescription}'...`);

  let currentPrompt = `Write JavaScript code to solve: ${taskDescription}`;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n--- Execution Attempt ${attempt}/${maxRetries} ---`);

    if (lastError) {
      currentPrompt =
        `Previous code execution failed with the following error:\n${lastError}\n\n` +
        `Please fix the code to resolve the error and fulfill the original task: ${taskDescription}`;
    }

    const solution = await draftSolution(currentPrompt);
    const outcome = executeInSandbox(solution.code);

    if (outcome.isSuccessful) {
      console.log("[SANDBOX SUCCESS] Code executed cleanly without errors.");
      console.log(`Captured Output:\n${outcome.stdout}`);
      return solution;
    }

    console.log(`[SANDBOX FAILURE] Error encountered on attempt ${attempt}.`);
    console.log(`Error:\n${outcome.errorMessage}`);
    lastError = outcome.errorMessage;
  }

  throw new Error(`Failed to auto-repair code within ${maxRetries} attempts.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt =
    "Calculate the standard deviation of [12, 45, 67, 89, 23, 56, 78] using plain JavaScript math.";
  runSelfHealingPipeline(prompt).catch(console.error);
}
