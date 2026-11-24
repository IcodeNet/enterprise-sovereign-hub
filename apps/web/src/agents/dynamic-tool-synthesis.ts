import "dotenv/config";
import vm from "node:vm";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Dynamic tool synthesis & runtime registration - Day 33 TS port.
 *
 * When a predefined tool doesn't exist for a task, an agent can synthesize
 * new JavaScript on the fly, validate it in a sandboxed vm context (same
 * isolation approach as Day 27's self-healing agent), and register it into
 * a runtime tool registry.
 */

const SynthesizedToolCodeSchema = z.object({
  toolName: z.string().describe("camelCase function name for the tool."),
  docstring: z.string().describe("Clear explanation of the tool's purpose."),
  jsCode: z.string().describe("Clean JavaScript function definition, no imports/requires."),
});

type SynthesizedToolCode = z.infer<typeof SynthesizedToolCodeSchema>;

class DynamicToolRegistry {
  private tools = new Map<string, (...args: unknown[]) => unknown>();

  compileAndRegister(codePayload: SynthesizedToolCode): void {
    const sandboxContext = vm.createContext({});
    // Run the function definition, then grab whatever it defined by
    // inspecting the sandbox's own context object afterward - the same
    // "find the real callable, don't trust the model's own name field"
    // recovery the Python side needed, since a model's stated toolName
    // doesn't always match what it actually wrote.
    vm.runInContext(codePayload.jsCode, sandboxContext, { timeout: 5000 });

    const definedNames = Object.keys(sandboxContext).filter(
      (key) => typeof sandboxContext[key] === "function",
    );

    let resolvedName = codePayload.toolName;
    let func = sandboxContext[codePayload.toolName] as
      | ((...args: unknown[]) => unknown)
      | undefined;

    if (typeof func !== "function") {
      if (definedNames.length === 1) {
        resolvedName = definedNames[0];
        func = sandboxContext[resolvedName] as (...args: unknown[]) => unknown;
        console.log(
          ` [NAME MISMATCH RECOVERED] toolName '${codePayload.toolName}' didn't match any defined ` +
            `function; found exactly one real callable instead: '${resolvedName}'.`,
        );
      } else {
        throw new Error(`Function ${codePayload.toolName} was not found in synthesized code.`);
      }
    }

    this.tools.set(resolvedName, func as (...args: unknown[]) => unknown);
    console.log(` [TOOL REGISTERED] Successfully added '${resolvedName}' to runtime registry.`);
  }

  runTool(name: string, ...args: unknown[]): unknown {
    const func = this.tools.get(name);
    if (!func) throw new Error(`Tool ${name} is not registered.`);
    return func(...args);
  }

  get registeredNames(): string[] {
    return [...this.tools.keys()];
  }
}

async function solveWithSyntheticTool(problemDescription: string): Promise<void> {
  console.log(`Step 1: Analyzing missing capability for: '${problemDescription}'...`);

  const authorPrompt =
    `Create a single JavaScript function to solve this problem: ${problemDescription}. ` +
    "The function must be fully self-contained, no imports/requires - it runs in an isolated " +
    "vm context with only a global crypto-like sha256 helper NOT available, so implement SHA-256 " +
    "manually if needed, or state clearly it needs crypto and use globalThis.cryptoSha256 if provided.";

  const { object: toolSpec } = await generateObject({
    model: openai("gpt-4o"),
    schema: SynthesizedToolCodeSchema,
    system:
      "We are an expert JavaScript systems engineer. Write pure, standalone JavaScript functions " +
      "that solve the missing functionality. Do not include external untrusted dependencies.",
    prompt: authorPrompt,
  });

  console.log("\nStep 2: Synthesized Tool Definition:");
  console.log(`Name: ${toolSpec.toolName}`);
  console.log(`Code:\n${toolSpec.jsCode}\n`);

  const registry = new DynamicToolRegistry();
  registry.compileAndRegister(toolSpec);

  console.log("\nStep 3: Executing newly synthesized tool...");
  const testInput = "Sovereign Intelligence Hub demo";
  const registeredName = registry.registeredNames[0];
  const output = registry.runTool(registeredName, testInput);

  console.log(`Runtime Execution Output: ${output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = "Create a function that reverses a string and returns it uppercased.";
  solveWithSyntheticTool(prompt).catch(console.error);
}
