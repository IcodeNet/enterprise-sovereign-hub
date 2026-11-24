import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class SwarmVote(BaseModel):
    worker_id: str
    proposed_solution: str = Field(description="Selected architecture choice.")
    confidence_score: float = Field(description="Confidence rating between 0.0 and 1.0.")


class FinalConsensus(BaseModel):
    winning_solution: str
    vote_count: int
    rationale: str


# Cheap, independent workers, all given the SAME question in parallel. Using
# a smaller/cheaper model here is deliberate: the value of a swarm doesn't
# come from any one worker being especially smart, it comes from having
# SEVERAL independent opinions to compare - a single expensive model call
# has no "second opinion" of its own to check itself against.
worker_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=SwarmVote,
    system_prompt="We are an independent software worker node voting on architectural patterns.",
)

# A separate, stronger model whose only job is to read every worker's vote
# and decide the actual winner - the same worker/auditor role split from
# Day 9, applied here to tallying votes instead of auditing generated code.
tally_agent = Agent(
    "openai:gpt-4o",
    output_type=FinalConsensus,
    system_prompt="We analyze votes from swarm worker nodes and determine the final winning consensus.",
)


async def run_swarm_vote(prompt: str, worker_count: int = 3) -> FinalConsensus:
    print(f"Step 1: Dispatching task to {worker_count} parallel swarm workers...")

    # Every worker gets the exact same underlying question, run as
    # independent, CONCURRENT calls (asyncio.gather, same tool as Day 8) -
    # not one worker informed by another's answer. Each worker's own
    # prompt explicitly states its ID, since nothing else in the request
    # would otherwise tell the model which worker it's supposed to be.
    tasks = [
        worker_agent.run(
            f"You are worker node #{i + 1} of {worker_count}. "
            f"Set worker_id to exactly 'worker-{i + 1}'. "
            f"Independently evaluate this requirement and propose your own solution: {prompt}"
        )
        for i in range(worker_count)
    ]

    worker_results = await asyncio.gather(*tasks)
    votes: list[SwarmVote] = [res.output for res in worker_results]

    print("\n--- Swarm Votes Collected ---")
    for vote in votes:
        print(f"Worker {vote.worker_id}: Proposed '{vote.proposed_solution}' (Confidence: {vote.confidence_score})")

    print("\nStep 2: Tallying consensus with Tally Agent...")
    tally_input = f"User Requirement: {prompt}\nVotes: {[v.model_dump() for v in votes]}"
    final_result = await tally_agent.run(tally_input)

    return final_result.output


if __name__ == "__main__":
    task_prompt = "Select the best state machine engine for multi-agent loops: LangGraph, Pydantic AI, or FastMCP."
    result = asyncio.run(run_swarm_vote(task_prompt, worker_count=3))

    print("\n--- Final Swarm Consensus ---")
    print(f"Winning Architecture: {result.winning_solution}")
    print(f"Vote Tally: {result.vote_count}")
    print(f"Rationale: {result.rationale}")
