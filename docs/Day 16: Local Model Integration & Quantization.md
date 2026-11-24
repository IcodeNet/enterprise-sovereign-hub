Day 16 is about running an AI model on your own machine instead of a cloud API - and a real, reproducible finding about why a smaller local model needs a genuinely different prompting strategy than a large cloud model does.

---

## Local Inference — Day 16: Local Model Integration & Quantization

### The Problem We're Solving

Every lesson so far has called a cloud AI API (OpenAI's GPT-4o/GPT-4o-mini). Cloud APIs cost money per call and add network latency - for low-risk, high-volume tasks (batch validation, internal tooling, anything where a mistake is cheap to catch and retry), routing to a **local, quantized open-weight model** running on your own machine can cut both cost and latency to near zero.

**Quantization** is a technique that shrinks a model's size (and memory/compute needs) by storing its internal numbers with less precision - e.g. the `qwen2.5-coder:7b` model used in this lesson runs a 7.6-billion-parameter model compressed down using 4-bit quantization (`Q4_K_M`), small enough to run comfortably on a laptop GPU or even CPU. **Ollama** is the tool that runs these quantized models locally and, conveniently, exposes an OpenAI-compatible API on `localhost:11434` - which means existing AI SDK code can talk to a local model by simply changing the base URL, no separate "local model" SDK required.

**A real, reproducible finding is the actual point of this lesson**: this local 7B model, called with `pydantic-ai`'s DEFAULT output strategy (which asks the model to respond via a simulated "tool call"), failed to produce valid structured output **9 times in a row** across repeated test runs - either malformed JSON with inline comments, or JSON missing required fields entirely. Switching to `NativeOutput` (asking the model to respond with a plain JSON object directly, rather than through the tool-call machinery) fixed it completely: 5 clean runs in a row afterward. This is real evidence that **smaller local models need a different prompting/output strategy than large cloud models, not just a different base URL.**

Focus: routing Pydantic AI to a local Ollama model with full type safety, and fixing a genuine structured-output reliability gap
Time investment: 15 minutes (assuming Ollama is already installed and a model is pulled)

### Step 1: Confirm Ollama Is Running and Pull a Model

```bash
ollama pull qwen2.5-coder:7b
```

Verify the API is reachable: `curl http://localhost:11434/api/tags` should list your pulled models.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/agents/`, create:
`local_inference_agent.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, NativeOutput
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

load_dotenv()


class LocalAnalysisResult(BaseModel):
    task_name: str = Field(description="Name of the analyzed local task.")
    cost_savings_gbp: float = Field(description="Estimated daily API cost savings in GBP.")
    execution_verdict: str = Field(description="Recommendation for cloud vs local execution.")


local_ollama_model = OpenAIChatModel(
    model_name="qwen2.5-coder:7b",
    provider=OpenAIProvider(
        base_url="http://localhost:11434/v1",
        api_key="ollama",
    ),
)

local_agent = Agent(
    model=local_ollama_model,
    # NativeOutput asks the model to respond directly with a JSON object
    # matching the schema, rather than routing the schema through a
    # simulated "tool call" (pydantic-ai's default output strategy). See
    # the Real Finding section below for the actual failure evidence.
    output_type=NativeOutput(LocalAnalysisResult),
    retries=3,
    model_settings={"temperature": 0.0, "extra_body": {"format": "json"}},
    system_prompt=(
        "We are a principal inference engineer. "
        "Analyze queries and evaluate the cost benefits of local vs cloud execution. "
        "Always respond with strictly valid JSON matching the schema exactly - no comments, "
        "no trailing commas, and no extra explanatory text outside the JSON object."
    ),
)


async def run_local_inference(query_text: str) -> LocalAnalysisResult:
    print("Executing query on local open-weight model (qwen2.5-coder:7b via Ollama)...")

    try:
        result = await local_agent.run(query_text)
        data: LocalAnalysisResult = result.output

        print("\n--- Local Inference Result Received ---")
        print(f"Task Name: {data.task_name}")
        print(f"Estimated Savings: £{data.cost_savings_gbp:.2f}/day")
        print(f"Verdict: {data.execution_verdict}")
        return data

    except Exception as err:
        print(f"\n[LOCAL INFERENCE ERROR]: Ensure Ollama is running locally. Error -> {err}")
        raise


if __name__ == "__main__":
    test_query = "Evaluate running 10,000 daily validation tasks locally instead of using cloud APIs."
    asyncio.run(run_local_inference(test_query))
```

### Step 4: The Real Finding - Run It, Break It, Fix It

Using plain `output_type=LocalAnalysisResult` (pydantic-ai's default tool-call output strategy) with no `NativeOutput` wrapper produces two different real failures across repeated attempts:

- `Invalid JSON: key must be a string` - the model emitted a tool-call-shaped JSON object with an inline `//` comment, which is invalid JSON syntax
- `Field required [type=missing]` - the model wrapped its answer in an extra layer (`{"name": "final_result", "arguments": {...}}`) that didn't match the flat schema

**9 consecutive runs failed this way.** Switching the agent's `output_type` to `NativeOutput(LocalAnalysisResult)` - which tells pydantic-ai to ask the model for a plain JSON object directly instead of simulating a tool call - fixed it completely. 5 clean runs followed, each producing identical, correctly-typed output:

```bash
python src/agents/local_inference_agent.py
```

```
Estimated Savings: £150.00/day
Verdict: local
```

---

## Best Practices

- **A smaller/quantized local model needs a genuinely different output strategy than a large cloud model, not just a different endpoint.** Cloud models like GPT-4o handle pydantic-ai's default tool-call-based structured output reliably; a 7B local model may not - `NativeOutput` (or the equivalent "ask for plain JSON directly" approach) is a real fix worth reaching for by default with smaller local models, not just when something breaks.
- **Ollama's own native JSON mode (`extra_body={"format": "json"}`) is a stronger guarantee than a prompt instruction alone.** Pass it through whenever the underlying provider supports it, rather than relying purely on "please respond with valid JSON" in the system prompt.
- **Run a flaky-looking local-model integration multiple times before concluding it's fixed.** A single clean run after a change could be luck; this lesson's 9-failures-then-5-successes pattern is what makes the fix credible evidence, not just a hopeful guess.

## Why This Matters in Production

Local/open-weight models are a real cost and latency win for low-risk, high-volume internal tasks - but they are not simply drop-in replacements for a cloud model at the API level. Structured-output reliability, in particular, can differ sharply by model size, and this lesson's concrete before/after evidence (9 failures, then 5 clean runs after one specific fix) is the kind of finding that would otherwise cost real debugging time in a production rollout.
