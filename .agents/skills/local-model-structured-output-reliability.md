# Fixing unreliable structured output from small/local models

## When to use this

A Pydantic AI or Vercel AI SDK call against a SMALL or LOCAL model (e.g. a 7B quantized model via Ollama) fails intermittently or consistently with a structured-output error, while the exact same code works fine against a large cloud model (GPT-4o, Claude).

## Symptoms

- Python (`pydantic-ai`): `ValidationError: Invalid JSON: key must be a string` (model emitted a JSON object with an inline `//` comment), or `Field required [type=missing]` where the fields ARE present but nested under an extra wrapper key like `{"name": "final_result", "arguments": {...}}`.
- TypeScript (Vercel AI SDK): `AI_NoObjectGeneratedError: No object generated: response did not match schema` alongside a runtime warning naming `"responseFormat" is not supported... only supported with structuredOutputs`.

## Root cause

Large cloud models reliably produce valid output for BOTH of the common structured-output strategies: (1) a simulated "tool call" where the schema is presented as a fake function to invoke, and (2) direct JSON-mode where the model is asked to emit an object matching a schema. Small/local models are measurably less reliable at strategy (1) specifically - they tend to wrap the real answer in extra keys, or slip in something that isn't strict JSON (a comment, a trailing explanation). Ollama's OpenAI-compatible endpoint also does not implement the SAME schema-enforcement contract OpenAI's real API does, so client libraries that lean on that contract (like the Vercel AI SDK's schema parameter) fall back to hoping the model follows the schema from the prompt text alone.

## Fix

**Python (`pydantic-ai`):** switch from the default output strategy to `NativeOutput`:

```python
from pydantic_ai import Agent, NativeOutput

agent = Agent(
    model=local_model,
    output_type=NativeOutput(YourSchema),   # NOT plain output_type=YourSchema
    retries=3,
    model_settings={"temperature": 0.0, "extra_body": {"format": "json"}},
    system_prompt="... Always respond with strictly valid JSON matching the schema exactly - no comments, no trailing commas, and no extra explanatory text outside the JSON object.",
)
```

`extra_body={"format": "json"}` passes Ollama's own native JSON-mode flag straight through - stronger than a prompt instruction alone.

**TypeScript (Vercel AI SDK):** the schema object alone isn't enough against a provider that doesn't support real structured-output enforcement - spell the EXACT flat shape out explicitly and bluntly in the system prompt:

```typescript
system:
  "... Respond with ONLY a single flat JSON object with EXACTLY these three keys, no nesting, " +
  'no comments, no extra keys: {"taskName": string, "costSavingsGbp": number, "executionVerdict": string}.',
```

Also set `temperature: 0` on both sides - it doesn't fix the failure mode alone, but it removes one source of run-to-run noise while you're diagnosing it.

## How to verify the fix actually worked (don't trust one clean run)

Run the script 3-5 times in a row after the fix. A single clean run could be luck; several used to reliably fail every time (9/9 in one documented case) and became reliable every time afterward (5/5, then 3/3) is what makes a fix credible. See `docs/Day 16: Local Model Integration & Quantization.md` for the full before/after evidence this pattern is based on.
