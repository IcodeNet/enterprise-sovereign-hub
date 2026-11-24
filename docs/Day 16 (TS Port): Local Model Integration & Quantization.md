This is Day 16's TypeScript side: the same local-Ollama routing, and the same class of structured-output reliability problem the Python lesson found - fixed with a different but equally concrete technique.

---

## Local Inference — Day 16 (TS Port): Local Model Integration & Quantization

### The Problem We're Solving

Same problem as the Python lesson: route a low-risk task to a local, quantized open-weight model via Ollama instead of a paid cloud API call, using the same AI SDK code with just a different endpoint.

**The same class of real finding showed up here too, with a different failure signature.** The Vercel AI SDK's `generateObject` first attempt against `qwen2.5-coder:7b` failed with `AI_NoObjectGeneratedError` - the model returned a nested object (`{"local_execution": {...}, "cloud_execution": {...}}`) instead of the flat three-field schema requested, and a runtime warning confirmed why: `"responseFormat" is not supported... JSON response format schema is only supported with structuredOutputs` - Ollama's OpenAI-compatible endpoint doesn't support the AI SDK's schema-enforcement mechanism the way OpenAI's own API does. The fix was an explicit, blunt instruction in the system prompt spelling out the exact flat shape expected, rather than relying on the SDK to enforce it structurally.

Focus: the same local-routing pattern, with a schema-enforcement gap the AI SDK can't paper over automatically
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the expected answer shape (`class LocalAnalysisResult(BaseModel)`) | the expected answer shape (`const LocalAnalysisResultSchema = z.object({...})`) |
| pointing at the local Ollama server (`OpenAIChatModel(model_name="qwen2.5-coder:7b", provider=OpenAIProvider(base_url="http://localhost:11434/v1"))`) | pointing at the local Ollama server (`createOpenAICompatible({ name: "ollama", baseURL: "http://localhost:11434/v1" })`) |
| setting up the agent (`Agent(model=local_ollama_model, output_type=NativeOutput(LocalAnalysisResult), retries=3)`) | choosing the model per call (`ollamaProvider("qwen2.5-coder:7b")`) |
| running it (`await local_agent.run(query_text)`) | running it (`await generateObject({ ..., schema: LocalAnalysisResultSchema, prompt: queryText })`) |
| reading the checked answer (`result.output`) | reading the checked answer (`{ object }`) |

### Step 1: Install the OpenAI-Compatible Provider

Inside `apps/web`:

```bash
npm install @ai-sdk/openai-compatible --legacy-peer-deps
```

*(This is the Vercel AI SDK's generic provider for any server speaking the OpenAI chat-completions API shape - not something Ollama-specific.)*

### Step 2: Create the Source File

Inside `apps/web/src/agents/`, create:
`local-inference-agent.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

const LocalAnalysisResultSchema = z.object({
  taskName: z.string().describe("Name of the analyzed local task."),
  costSavingsGbp: z.number().describe("Estimated daily API cost savings in GBP."),
  executionVerdict: z.string().describe("Recommendation for cloud vs local execution."),
});

type LocalAnalysisResult = z.infer<typeof LocalAnalysisResultSchema>;

const ollamaProvider = createOpenAICompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

async function runLocalInference(queryText: string): Promise<LocalAnalysisResult> {
  console.log("Executing query on local open-weight model (qwen2.5-coder:7b via Ollama)...");

  try {
    const { object } = await generateObject({
      model: ollamaProvider("qwen2.5-coder:7b"),
      schema: LocalAnalysisResultSchema,
      temperature: 0,
      system:
        "We are a principal inference engineer. " +
        "Analyze queries and evaluate the cost benefits of local vs cloud execution. " +
        "Respond with ONLY a single flat JSON object with EXACTLY these three keys, no nesting, " +
        'no comments, no extra keys: {"taskName": string, "costSavingsGbp": number, "executionVerdict": string}.',
      prompt: queryText,
    });

    console.log("\n--- Local Inference Result Received ---");
    console.log(`Task Name: ${object.taskName}`);
    console.log(`Estimated Savings: £${object.costSavingsGbp.toFixed(2)}/day`);
    console.log(`Verdict: ${object.executionVerdict}`);
    return object;
  } catch (error) {
    console.log(`\n[LOCAL INFERENCE ERROR]: Ensure Ollama is running locally. Error -> ${error}`);
    throw error;
  }
}

const testQuery = "Evaluate running 10,000 daily validation tasks locally instead of using cloud APIs.";
runLocalInference(testQuery).catch(console.error);
```

### Step 4: The Real Finding - Run It, Break It, Fix It

Using only a generic "analyze the cost benefits" system prompt and relying on the Zod schema passed to `generateObject` to enforce shape works against OpenAI's API, but against Ollama this produces:

```
AI_NoObjectGeneratedError: No object generated: response did not match schema.
```

with the underlying model output revealing a nested, differently-shaped object (`local_execution`/`cloud_execution` sub-objects) instead of the requested flat three fields - and a runtime warning explaining exactly why: `"responseFormat" is not supported... JSON response format schema is only supported with structuredOutputs`. Ollama's OpenAI-compatible layer doesn't implement the same schema-enforcement contract OpenAI's real API does, so the AI SDK falls back to hoping the model follows the schema from the prompt alone.

The fix was spelling out the EXACT flat shape directly and explicitly in the system prompt ("ONLY a single flat JSON object with EXACTLY these three keys, no nesting"), rather than trusting the schema object to communicate that on its own:

```bash
cd apps/web
npx tsx src/agents/local-inference-agent.ts
```

3 clean runs followed, each producing identical, correctly-typed, non-nested output:

```
Estimated Savings: £200.00/day
Verdict: Local
```

---

## Best Practices

- **Don't assume a provider's OpenAI-compatible endpoint supports every part of the OpenAI contract - specifically schema/structured-output enforcement.** Ollama speaks the chat-completions API shape, but its structured-output guarantees are weaker than OpenAI's own, and the AI SDK's own runtime warning says so directly if you read it.
- **When a smaller/local model doesn't respect a schema passed programmatically, spell the shape out explicitly and bluntly in the prompt text itself.** This is the TS-side equivalent of the Python lesson's `NativeOutput` fix - a different mechanism, but the same underlying lesson: don't trust structural enforcement alone with a smaller local model.
- **A runtime warning that says a specific feature "is not supported" is a direct, named root cause - read it before guessing.** The AI SDK's warning here named the exact missing capability; treating that as noise to ignore would have cost real debugging time chasing the wrong theory.

## Why This Matters in Production

The exact SAME underlying limitation (a smaller local model's weaker structured-output guarantees) showed up in both languages, but manifested and needed fixing differently in each - malformed/wrapped JSON in Python's tool-call mode, a schema-mismatched nested object in TypeScript's schema-enforcement mode. Neither fix would have been found by only reading documentation; both came from running the code, reading the actual failure, and fixing the real cause.
