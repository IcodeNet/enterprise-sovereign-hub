Day 5 is about letting an AI pipeline branch on its own, based on real data, instead of always running the same fixed sequence of steps.

---

## LangGraph — Day 5: Stateful Agent Graphs & Conditional Routing

### The Problem We're Solving

Every lesson so far has run in one fixed straight line: step 1, then step 2, then step 3, always in that order. Real engineering decisions aren't that simple - "is this a high-priority skill or not?" should send the work down a genuinely different path, not just change a variable's value while the same steps keep running regardless.

> The real problem is deciding the next operational step from state, not just generating text. The role of the graph is to make that control flow explicit: it owns step order, branch rules, and state updates. LLMs still do useful work inside steps (for example, extracting entities and intent from the customer question), but they do not directly decide control flow.

If control flow stays implicit inside one model prompt, planning, tool use, retrieval, guardrails, and human approval can blur into one opaque step. Then teams cannot clearly answer why a request took a specific path, why a safety gate was skipped, or why a risky action was attempted. The graph fixes that by turning routing into an explicit, auditable system decision.

LangGraph's answer is a **graph**: a diagram of nodes (steps) and edges (the paths between them), where some edges are conditional - the graph checks the current state and picks which node runs next, live, while it's running. This is the same idea Day 4's workflow steps introduced (each step does one job, hands off to the next), but now the hand-off itself can fork into different paths depending on what was actually found, not just always going to the next step in a fixed list.

Focus: building a graph with typed shared state and a branch that's chosen based on real data
Time investment: 15 minutes

### Step 1: Install LangGraph

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install langgraph langchain-openai
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/graphs/`, create:
`market_graph.py`

### Step 3: Add the Source Code

```python
import asyncio
from typing import Literal, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

load_dotenv()


# A workflow's state is the shared notebook every step reads from and
# writes to. Typing it with TypedDict means a typo in a key name is
# caught immediately instead of silently returning None deep in a later step.
class MarketState(TypedDict):
    job_query: str
    identified_skill: str
    demand_level: str
    final_report: str


# Node 1: ask the AI to pull the one skill name out of a messy job posting.
async def extract_skill_node(state: MarketState) -> dict[str, str]:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    response = await llm.ainvoke(
        [
            SystemMessage(
                content="Extract the primary technical skill name (e.g., LangGraph, Pydantic AI) from the user's job query. Reply with only the skill name."
            ),
            HumanMessage(content=state["job_query"]),
        ]
    )
    skill = str(response.content).strip()
    return {"identified_skill": skill}


# Node 2: decide, from a small fixed list, whether this is one of our
# core target skills. This node doesn't call the AI at all - a plain, fast,
# deterministic check is enough here.
async def evaluate_demand_node(state: MarketState) -> dict[str, str]:
    skill = state["identified_skill"].lower()
    target_stack = ["langgraph", "pydantic", "vercel ai", "llamaindex"]
    demand = "HIGH_DEMAND" if any(target in skill for target in target_stack) else "STANDARD_DEMAND"
    return {"demand_level": demand}


# Node 3A: runs only when the skill was flagged high-demand.
async def high_priority_evaluator(state: MarketState) -> dict[str, str]:
    report = (
        f"PRIORITY TRACK: '{state['identified_skill']}' is a high-demand core skill. "
        "Adding a 15-minute hands-on module directly to our portfolio track."
    )
    return {"final_report": report}


# Node 3B: runs only when the skill was NOT flagged high-demand.
async def standard_evaluator(state: MarketState) -> dict[str, str]:
    report = f"STANDARD TRACK: Identified skill '{state['identified_skill']}'. Added to backlog."
    return {"final_report": report}


# The routing function is what makes this graph branch. LangGraph calls
# this after evaluate_demand_node finishes, and whichever node name comes
# back is the one that runs next.
def route_by_demand(state: MarketState) -> Literal["high_priority_evaluator", "standard_evaluator"]:
    if state["demand_level"] == "HIGH_DEMAND":
        return "high_priority_evaluator"
    return "standard_evaluator"


builder = StateGraph(MarketState)

builder.add_node("extract_skill_node", extract_skill_node)
builder.add_node("evaluate_demand_node", evaluate_demand_node)
builder.add_node("high_priority_evaluator", high_priority_evaluator)
builder.add_node("standard_evaluator", standard_evaluator)

builder.set_entry_point("extract_skill_node")
builder.add_edge("extract_skill_node", "evaluate_demand_node")

builder.add_conditional_edges(
    "evaluate_demand_node",
    route_by_demand,
    {
        "high_priority_evaluator": "high_priority_evaluator",
        "standard_evaluator": "standard_evaluator",
    },
)

builder.add_edge("high_priority_evaluator", END)
builder.add_edge("standard_evaluator", END)

market_graph = builder.compile()


async def main():
    initial_state: MarketState = {
        "job_query": "Senior AI Role requiring expertise in LangGraph and production agent graphs.",
        "identified_skill": "",
        "demand_level": "",
        "final_report": "",
    }

    print("Executing LangGraph State Machine...")
    final_output = await market_graph.ainvoke(initial_state)

    print("\n--- Final Graph State Output ---")
    print(f"Identified Skill: {final_output['identified_skill']}")
    print(f"Demand Classification: {final_output['demand_level']}")
    print(f"Report Output: {final_output['final_report']}")


if __name__ == "__main__":
    asyncio.run(main())
```

*(Note: the node functions above return a plain `dict[str, str]`, not the full `MarketState` type, even though logically each node only fills in one or two of the four fields. This is deliberate - LangGraph merges whatever a node returns into the existing state, so a node only needs to hand back the piece it actually changed. Typing them as `dict[str, str]` instead of `MarketState` is what a real type checker (Pyright/Pylance) requires here - returning `MarketState` would force every node to also supply fields it has no reason to touch.)*

### Step 4: Run and Verify

```bash
python src/graphs/market_graph.py
```

You should see it correctly classify "LangGraph" as `HIGH_DEMAND` and take the priority-track branch, since it's in our target stack.

---

## Best Practices

- **Let the routing function's return value BE the next node's name.** `route_by_demand` doesn't set a flag someone else reads later - its return value is looked up directly against the path map LangGraph was given, so the branching logic lives in exactly one place.
- **Use a plain deterministic check instead of another AI call when one will do.** `evaluate_demand_node` never touches the model - a simple keyword match is faster, free, and can't hallucinate, so reaching for an AI call here would be unnecessary and slower for no benefit.
- **Return only the state fields a node actually changed, not the whole state object.** This keeps each node's job narrow and obvious from its return type, and matches what the graph engine expects to merge in.

## Why This Matters in Production

Not every AI pipeline should always do the same thing regardless of what it finds. A graph like this can send a genuinely different, cheaper, or more thorough path depending on real data - e.g. routing a low-confidence result to a human review step instead of always running the same fixed sequence blindly. This is the foundation Day 9's multi-agent verification loop will build on.
