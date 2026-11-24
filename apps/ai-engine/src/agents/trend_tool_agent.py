import asyncio
from dataclasses import dataclass

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

load_dotenv()


# Defines a small bundle of "live" data (a user ID and a fake database) that gets handed
# to the AI at run time, instead of being hardcoded into the AI's setup.
@dataclass
class DatabaseDeps:
    user_id: str
    skill_database: dict[str, int]  # Simulates live market counts in DB


# Defines the exact shape the AI's final answer must fit into: which skill it checked,
# the live count it found, and a recommendation based on that count.
class TrendAssessment(BaseModel):
    skill_name: str = Field(description="The technical skill evaluated.")
    live_count: int = Field(description="Current job posting frequency in database.")
    recommendation: str = Field(
        description="Actionable advice for our engineering roadmap."
    )


# Sets up the AI: which model to use, that it will receive a DatabaseDeps bundle at run time,
# forces its final reply into the TrendAssessment shape above, and gives it a role.
trend_agent = Agent(
    "openai:gpt-4o",
    deps_type=DatabaseDeps,
    output_type=TrendAssessment,
    system_prompt=(
        "We are a principal AI systems architect. "
        "Use the provided tool to query live database metrics before making recommendations."
    ),
)


# Gives the AI a tool it can call mid-answer: a function that looks up a skill's live count
# in the database bundle it was handed, instead of the AI guessing the number itself.
@trend_agent.tool
async def fetch_live_skill_count(ctx: RunContext[DatabaseDeps], skill_name: str) -> int:
    """Queries our internal database for current live job posting counts for a skill."""
    # Retrieve the live database client from injected dependencies
    db = ctx.deps.skill_database
    formatted_key = skill_name.lower().strip()
    return db.get(formatted_key, 0)


# Starts the test: builds a fake database bundle, then asks the AI a question that requires
# it to actually call the tool above to get a real number before answering.
async def main():
    # Inject our mock database and context dependencies at runtime
    mock_deps = DatabaseDeps(
        user_id="byron_lead_dev",
        skill_database={
            "pydantic ai": 142,
            "vercel ai sdk": 98,
            "llamaindex": 85,
        },
    )

    prompt = "Check live demand for Pydantic AI in our database and evaluate if we should prioritize it."
    print("Executing agent query with injected dependencies...")

    # Sends the question to the AI along with the fake database bundle, and waits for
    # its answer — the AI decides on its own to call fetch_live_skill_count first.
    result = await trend_agent.run(prompt, deps=mock_deps)

    # Grabs the AI's already-checked, properly-shaped answer out of the response.
    output: TrendAssessment = result.output
    print("\n--- Validated Agent Result ---")
    print(f"Target Skill: {output.skill_name}")
    print(f"Database Count: {output.live_count}")
    print(f"Recommendation: {output.recommendation}")


# Makes sure this whole test only runs when you execute this file directly, then kicks it off.
if __name__ == "__main__":
    asyncio.run(main())
