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


# Ollama serves an OpenAI-compatible API on localhost, so a real cloud AI
# model class can point at it directly by swapping the base URL - no
# separate "local model" SDK is needed. Newer pydantic-ai splits the model
# class (OpenAIChatModel) from its connection details (OpenAIProvider),
# unlike the older single-class OpenAIModel(base_url=..., api_key=...)
# shape - the provider carries the base_url/api_key, the model carries only
# the model name.
local_ollama_model = OpenAIChatModel(
    model_name="qwen2.5-coder:7b",
    provider=OpenAIProvider(
        base_url="http://localhost:11434/v1",
        api_key="ollama",  # Dummy key required by the OpenAI client protocol; Ollama ignores it.
    ),
)

local_agent = Agent(
    model=local_ollama_model,
    # NativeOutput asks the model to respond directly with a JSON object
    # matching the schema, rather than routing the schema through a
    # simulated "tool call" (pydantic-ai's default output strategy). The
    # smaller qwen2.5-coder:7b model reliably produces valid tool-call-
    # shaped JSON far less often than it produces a plain JSON object when
    # asked directly - see the Real Finding note in the doc for the actual
    # failure evidence this fixes.
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
