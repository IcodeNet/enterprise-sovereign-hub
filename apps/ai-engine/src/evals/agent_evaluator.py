import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class SystemArchitectureProposal(BaseModel):
    title: str = Field(description="Title of the recommended system component.")
    recommendation: str = Field(description="Detailed engineering recommendation.")


class EvaluationRubricScore(BaseModel):
    accuracy_score: int = Field(description="Score from 1 to 10 measuring technical precision.")
    clarity_score: int = Field(description="Score from 1 to 10 evaluating plain English clarity.")
    is_production_ready: bool = Field(description="True if recommendation meets enterprise standards.")
    detailed_justification: str = Field(description="Explanation for assigned rubric scores.")


# The agent being graded and the agent doing the grading are two SEPARATE
# models with separate system prompts - the same target/judge split Day 10
# used for deepeval, but built here as plain pydantic-ai agents instead of
# a dedicated eval library, useful when the eval rubric is simple enough
# not to need one.
target_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=SystemArchitectureProposal,
    system_prompt="We are an AI software engineer suggesting architectural patterns.",
)

judge_agent = Agent(
    "openai:gpt-4o",
    output_type=EvaluationRubricScore,
    system_prompt=(
        "We are a principal AI systems auditor acting as an LLM-as-a-Judge evaluator. "
        "Evaluate candidate proposals stringently based on technical correctness and enterprise readiness."
    ),
)


async def run_evaluation_benchmark(test_prompt: str) -> EvaluationRubricScore:
    print("Step 1: Running Target Agent to generate candidate response...")
    agent_response = await target_agent.run(test_prompt)
    candidate_data: SystemArchitectureProposal = agent_response.output

    print("\n--- Target Agent Output Generated ---")
    print(f"Title: {candidate_data.title}")
    print(f"Proposal: {candidate_data.recommendation[:120]}...")

    print("\nStep 2: Dispatching candidate output to LLM-as-a-Judge Evaluator...")
    judge_input = (
        f"Original User Prompt: {test_prompt}\n"
        f"Candidate Proposal Title: {candidate_data.title}\n"
        f"Candidate Recommendation: {candidate_data.recommendation}"
    )

    evaluation_response = await judge_agent.run(judge_input)
    score_data: EvaluationRubricScore = evaluation_response.output

    print("\n--- Evaluation Benchmark Complete ---")
    print(f"Technical Accuracy Score: {score_data.accuracy_score}/10")
    print(f"Clarity Score: {score_data.clarity_score}/10")
    print(f"Production Ready: {score_data.is_production_ready}")
    print(f"Judge Justification: {score_data.detailed_justification}")

    return score_data


if __name__ == "__main__":
    benchmark_prompt = "Explain how to implement dynamic dependency injection in Pydantic AI without global variables."
    asyncio.run(run_evaluation_benchmark(benchmark_prompt))
