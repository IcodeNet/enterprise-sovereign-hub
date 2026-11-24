This is Day 2 of our **Enterprise Sovereign Intelligence Hub** build: giving an AI a way to check real, current facts instead of only working from what it was told in the prompt.

---

## Pydantic AI — Day 2: Live Facts & Tool Calling

### The Problem We're Solving

An AI only knows two things: what it learned during training (which is frozen and can be out of date), and whatever you type into the prompt right now. It has no way to look up a real, current number — how many job postings exist today, what a live database actually says — unless you give it a way to go and check.

Baking that live data straight into the AI's setup doesn't work either. The moment you have more than one user, or the number changes between requests, a hardcoded value is instantly wrong. What we need is a way to hand the AI fresh, request-specific facts right when it runs, plus a tool it can call itself, mid-answer, to fetch a real number instead of guessing one.

Focus: handing the AI live data at the moment it runs, and giving it a tool it can call itself to fetch facts
Time investment: 15 minutes

Pydantic AI does this with two matched pieces: a `deps_type` — a small bundle of live data handed to the AI each time it runs — and an `@agent.tool`-decorated function the AI can call mid-answer to actually check something in that bundle.

### Step 1: Create the Market Tool Source File

Inside our workspace directory, let's create a new agent module:
`apps/ai-engine/src/agents/trend_tool_agent.py`

### Step 2: Give the AI Live Data and a Tool to Check It

Paste the following code into `trend_tool_agent.py`. Notice how the tool function reads from the live data bundle handed to the AI, instead of any value hardcoded ahead of time:

```python
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
```

*(Note: this listing uses valid names (`output_type`, `result.output`) and avoids invalid names that now cause errors — see [Day 1's notes](Day%201%3A%20Type-Safe%20Agent%20Foundations.md) for details.)*

### Step 3: Run and Verify

Make sure your virtual environment is switched on (`(.venv)` at the start of your terminal prompt), install any new packages, and run the script:

```bash
pip install -r requirements.txt
python src/agents/trend_tool_agent.py
```

*(Note: Make sure your `apps/ai-engine/.env` settings file has a real `OPENAI_API_KEY`, as covered in Day 1. If you hit a certificate error, see Day 1's note on that — it's a computer-wide trust issue, not something specific to this script.)*

---

## Best Practices

- **Hand live data to the AI at the moment it runs — never bake it into the AI's setup or a shared global value.** This is what lets you swap in a fake database for testing without touching any of the AI's own code.
- **Give each tool one clear job and a plain-English description the AI can read.** The AI reads that description to decide when to call the tool — it isn't just there for human readers.
- **Keep the tool itself quick and predictable.** A tool the AI can call mid-answer should be a simple lookup, not something slow or unreliable — the AI might call it more than once in a single answer.
- **Give the live-data bundle a strict shape too, the same way you shape the AI's answer.** This catches a mistyped field name immediately, rather than after a failed run.

## Why This Matters in Production

By handing data to the AI at run time instead of hardcoding it, our AI helpers stay easy to test — swap in fake data, no code changes needed inside the AI's own setup. This is also the core idea behind "agentic" AI: the model isn't limited to what it already knows, it can decide for itself that it needs to check a real fact and go get one, then use that real fact in its final answer.

To see how the same live-data-and-tool pattern works in the Vercel AI SDK / TypeScript version of this lesson, see the [TypeScript port of this lesson](Day%202%20%28TS%20Port%29%3A%20Vercel%20AI%20SDK%20Live%20Tools%20%26%20Fresh%20Data.md).
