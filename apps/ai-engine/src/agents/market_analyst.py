# Brings in a helper that can read secret settings (like API keys) from a hidden .env file.
from dotenv import load_dotenv

# Brings in the tools for defining a strict data shape with described fields.
from pydantic import BaseModel, Field

# Brings in the library that lets an AI model be wrapped with rules about what it's allowed to reply with.
from pydantic_ai import Agent

# Actually reads that hidden .env file now, so the API key inside it becomes available to the program.
load_dotenv()


# Defines the exact shape the AI's answer must fit into: a skill name, a number 1-10 showing demand,
# and a one-sentence reason — with each field's meaning spelled out for the AI.
class MarketInsight(BaseModel):
    skill_name: str = Field(
        description="The exact name of the technical skill identified."
    )
    demand_frequency: int = Field(
        description="Frequency level found in text from 1 (low) to 10 (high)."
    )
    justification: str = Field(
        description="A single clear sentence explaining why this skill is needed."
    )


# Sets up the AI itself: which model to use, forces every reply into the fixed shape from above,
# and gives it a role — "act like a senior engineer analyzing job requirements".
market_agent = Agent(
    "openai:gpt-4o",
    output_type=MarketInsight,
    system_prompt=(
        "We are a principal AI systems engineer. "
        "Our job is to analyze text and extract technical requirements cleanly."
    ),
)


# Starts the test function, with a made-up job description fed in as the input to try it out on.
async def run_analysis():
    sample_job = (
        "Looking for an engineer to build production RAG systems. "
        "Must be highly proficient in Pydantic AI to build type-safe agent graphs "
        "and handle complex schema validation across backend microservices."
    )

    # Prints a message so you can see it's about to contact the AI, then sends the job description
    # and waits for its structured answer.
    print("Sending text to agent...")
    result = await market_agent.run(sample_job)

    # Grabs the AI's already-checked, properly-shaped answer out of the response.
    data: MarketInsight = result.output
    # Prints out each piece of that answer nicely.
    print("\n--- Validated Agent Output Received ---")
    print(f"Skill: {data.skill_name}")
    print(f"Frequency Score: {data.demand_frequency}/10")
    print(f"Justification: {data.justification}")


# Makes sure this whole test only runs when you execute this file directly, then kicks it off.
if __name__ == "__main__":
    import asyncio

    asyncio.run(run_analysis())
