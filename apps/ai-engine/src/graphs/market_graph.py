import asyncio
from typing import Literal, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

load_dotenv()


# A workflow's state is the shared notebook every step reads from and
# writes to. Typing it with TypedDict means a typo in a key name is
# caught immediately instead of silently returning None deep in a later
# step, the same benefit Day 4's typed events gave us.
class MarketState(TypedDict):
    job_query: str
    identified_skill: str
    demand_level: str
    final_report: str


# Node 1: ask the AI to pull the one skill name out of a messy job posting,
# so every later step can work with a single clean word instead of parsing
# free text itself.
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
# core target skills or something else. This node doesn't call the AI at
# all - a plain, fast, deterministic check is enough here, and using one
# where we can avoids an unnecessary AI call.
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


# The routing function is what makes this graph branch instead of running
# in one fixed straight line. LangGraph calls this after evaluate_demand_node
# finishes, and whichever node name comes back is the one that runs next -
# the graph itself decides its own path at run time, based on real data.
def route_by_demand(state: MarketState) -> Literal["high_priority_evaluator", "standard_evaluator"]:
    if state["demand_level"] == "HIGH_DEMAND":
        return "high_priority_evaluator"
    return "standard_evaluator"


# Wires the four nodes together into one graph: a fixed start, a fixed
# middle step, then a branch point that leads to exactly one of the two
# final nodes depending on what evaluate_demand_node decided.
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


# Starts the test: runs the whole graph on one real job query, and prints
# which branch it actually took plus the final report from that branch.
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
