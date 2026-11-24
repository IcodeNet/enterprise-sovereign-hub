Day 15 is about getting a more reliable answer out of several independent AI opinions instead of trusting a single call - and about a real, honest limit on how much more reliable that actually makes things.

---

## Agent Swarms — Day 15: Decentralized Consensus Voting

### The Problem We're Solving

A single AI call is a single point of failure: if that one call hallucinates or has an off day, nothing catches it. **Consensus voting** runs several independent "worker" agents on the exact same question in parallel, then has a separate "tally" agent look at all their answers and decide the winner - the idea being that a mistake one worker makes is less likely to be repeated by all of them.

This lesson's Python and TypeScript runs produced a genuinely important, honest finding worth stating upfront rather than hiding: **run repeatedly, the swarm did not reliably agree on the technically correct answer.** For the question "which of LangGraph, Pydantic AI, or FastMCP is the best state machine engine for multi-agent loops" (the technically correct answer is LangGraph - FastMCP is a tool-server protocol, not a state machine engine), the `gpt-4o-mini` workers used in this lesson consistently and confidently voted for FastMCP across repeated runs, while a `gpt-4o` worker run (used on the TS side) voted for LangGraph. Every vote came back with unanimous or majority confidence either way - **confidence and unanimity are not evidence of correctness; they just mean several copies of a similar model tend to make similar mistakes together.**

This isn't a bug in this lesson's code - it's real, useful evidence about what consensus voting actually buys you: protection against ONE worker's random slip-up, not protection against a *systematic* blind spot the whole worker population shares.

Focus: parallel multi-agent voting with a separate tally/consensus agent
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/agents/`, create:
`swarm_consensus.py`

### Step 3: Add the Source Code

```python
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


worker_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=SwarmVote,
    system_prompt="We are an independent software worker node voting on architectural patterns.",
)

tally_agent = Agent(
    "openai:gpt-4o",
    output_type=FinalConsensus,
    system_prompt="We analyze votes from swarm worker nodes and determine the final winning consensus.",
)


async def run_swarm_vote(prompt: str, worker_count: int = 3) -> FinalConsensus:
    print(f"Step 1: Dispatching task to {worker_count} parallel swarm workers...")

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
```

Real fix versus the initial lesson version: the worker prompt never actually told each worker its own ID, so `worker_id` had nothing to anchor to and the AI would have to guess it. This version explicitly instructs each worker to set its ID to `worker-{N}`, so the field is genuinely populated by design rather than by luck.

### Step 4: Run and Verify - Twice

```bash
python src/agents/swarm_consensus.py
```

Run 1: unanimous 3/3 vote for FastMCP (technically the wrong answer).
Run 2: majority 2/3 vote, again for FastMCP.

Running it more than once and getting the SAME wrong answer both times is real evidence this isn't random noise - it's `gpt-4o-mini`'s specific, repeatable blind spot on this particular question, which a naive single "did it run without crashing" check would never have surfaced.

---

## Best Practices

- **Unanimous confidence across several workers is not evidence of correctness - it's evidence the workers share a common blind spot on this specific question.** If every worker is the same model family, a mistake one of them is prone to make, they are ALL prone to make, and voting won't fix that.
- **Run a consensus system more than once before trusting its output.** A single run's unanimous vote looks convincing; a second run either confirms it's a real, repeatable answer or reveals it was one particular model's specific systematic error.
- **State each worker's identity explicitly in its own prompt if the output schema expects an ID field.** Don't assume the model will infer which worker it "is" from context alone - the initial prompt draft didn't do this, and the field would have been unreliable as a result.

## Why This Matters in Production

Consensus voting is a real reliability improvement over a single AI call, but it is not a magic correctness guarantee - it protects against one worker's random one-off mistake, not against a systematic blind spot the whole worker population shares (e.g. all workers being the same model family). Treat a unanimous swarm vote as "several independent runs agreed," not as "this must be right," and never skip the step of running it more than once before trusting a surprising result.
