This is Day 5's TypeScript side: the same branching graph as the Python lesson, using LangGraph.js instead of LangGraph's Python library.

---

## LangGraph.js — Day 5 (TS Port): Stateful Agent Graphs & Conditional Routing

### The Problem We're Solving

Same problem as the Python lesson: a pipeline that always runs the same fixed sequence of steps can't make a real decision - "is this high-priority or not?" needs to genuinely change which steps run next, not just flip a variable while the same steps keep going regardless.

> The real problem is deciding the next operational step from state, not just generating text. The role of the graph is to make that control flow explicit: it owns step order, branch rules, and state updates. LLMs still do useful work inside steps (for example, extracting entities and intent from the customer question), but they do not directly decide control flow.

If control flow stays implicit inside one model prompt, planning, tool use, retrieval, guardrails, and human approval can blur into one opaque step. Then teams cannot clearly answer why a request took a specific path, why a safety gate was skipped, or why a risky action was attempted. The graph fixes that by turning routing into an explicit, auditable system decision.

LangGraph.js is the real TypeScript sibling of Python's LangGraph, not a from-scratch reimplementation - same graph-of-nodes-and-edges model, same idea of a conditional edge that picks the next node live based on the graph's current state.

Focus: the same typed-state branching graph, built with LangGraph.js's `StateGraph`
Time investment: 15 minutes (assuming Day 5's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the shared state shape (`class MarketState(TypedDict)`) | the shared state shape (`const MarketState = new StateSchema({...})`) |
| building the graph (`builder = StateGraph(MarketState)` + `builder.add_node(...)`) | building the graph (`new StateGraph(MarketState).addNode(...)`) |
| the branch-picking function (`route_by_demand`) | the branch-picking function (`routeByDemand`) |
| wiring the branch (`builder.add_conditional_edges("evaluate_demand_node", route_by_demand, {...})`) | wiring the branch (`.addConditionalEdges("evaluateDemandNode", routeByDemand, {...})`) |
| running it (`await market_graph.ainvoke(initial_state)`) | running it (`await graph.invoke({...})`) |
| reading the result (`final_output['final_report']`) | reading the result (`finalOutput.finalReport`) |

### Step 1: Install the Packages

Inside `apps/web`:

```bash
npm install @langchain/langgraph @langchain/core --legacy-peer-deps
```

### Step 2: Create the Source File

Inside `apps/web/src/graphs/`, create:
`market-graph.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import * as z from "zod";

// A workflow's state is the shared notebook every node reads from and
// writes to. StateSchema (backed by Zod here) is LangGraph.js's typed
// version of Day 5's Python TypedDict.
const MarketState = new StateSchema({
  jobQuery: z.string(),
  identifiedSkill: z.string(),
  demandLevel: z.string(),
  finalReport: z.string(),
});

// Node 1: ask the AI to pull the one skill name out of a messy job posting.
async function extractSkillNode(state: typeof MarketState.State) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "Extract the primary technical skill name (e.g., LangGraph, Pydantic AI) from the user's job query. Reply with only the skill name.",
    prompt: state.jobQuery,
  });
  return { identifiedSkill: text.trim() };
}

// Node 2: decide, from a small fixed list, whether this is one of our
// core target skills. This node doesn't call the AI at all.
async function evaluateDemandNode(state: typeof MarketState.State) {
  const skill = state.identifiedSkill.toLowerCase();
  const targetStack = ["langgraph", "pydantic", "vercel ai", "llamaindex"];
  const demand = targetStack.some((target) => skill.includes(target)) ? "HIGH_DEMAND" : "STANDARD_DEMAND";
  return { demandLevel: demand };
}

// Node 3A: runs only when the skill was flagged high-demand.
async function highPriorityEvaluator(state: typeof MarketState.State) {
  const report =
    `PRIORITY TRACK: '${state.identifiedSkill}' is a high-demand core skill. ` +
    "Adding a 15-minute hands-on module directly to our portfolio track.";
  return { finalReport: report };
}

// Node 3B: runs only when the skill was NOT flagged high-demand.
async function standardEvaluator(state: typeof MarketState.State) {
  const report = `STANDARD TRACK: Identified skill '${state.identifiedSkill}'. Added to backlog.`;
  return { finalReport: report };
}

// The routing function is what makes this graph branch instead of running
// in one fixed straight line.
function routeByDemand(state: typeof MarketState.State): "highPriorityEvaluator" | "standardEvaluator" {
  return state.demandLevel === "HIGH_DEMAND" ? "highPriorityEvaluator" : "standardEvaluator";
}

const graph = new StateGraph(MarketState)
  .addNode("extractSkillNode", extractSkillNode)
  .addNode("evaluateDemandNode", evaluateDemandNode)
  .addNode("highPriorityEvaluator", highPriorityEvaluator)
  .addNode("standardEvaluator", standardEvaluator)
  .addEdge(START, "extractSkillNode")
  .addEdge("extractSkillNode", "evaluateDemandNode")
  .addConditionalEdges("evaluateDemandNode", routeByDemand, {
    highPriorityEvaluator: "highPriorityEvaluator",
    standardEvaluator: "standardEvaluator",
  })
  .addEdge("highPriorityEvaluator", END)
  .addEdge("standardEvaluator", END)
  .compile();

async function main() {
  console.log("Executing LangGraph State Machine (TypeScript)...");

  const finalOutput = await graph.invoke({
    jobQuery: "Senior AI Role requiring expertise in LangGraph and production agent graphs.",
    identifiedSkill: "",
    demandLevel: "",
    finalReport: "",
  });

  console.log("\n--- Final Graph State Output ---");
  console.log(`Identified Skill: ${finalOutput.identifiedSkill}`);
  console.log(`Demand Classification: ${finalOutput.demandLevel}`);
  console.log(`Report Output: ${finalOutput.finalReport}`);
}

main().catch(console.error);
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/graphs/market-graph.ts
```

You should see the identical outcome to the Python version: "LangGraph" correctly classified as `HIGH_DEMAND`, routed to the priority-track branch.

---

## Best Practices

- **`StateSchema` + Zod is LangGraph.js's typed state, the direct sibling of Python's `TypedDict`.** Both exist for the same reason: catch a typo in a state field name immediately, at compile/type-check time, instead of at runtime.
- **A node only returns the fields it actually changed, same as the Python version.** LangGraph.js merges whatever a node hands back into the existing state - a node claiming to return the entire state object when it only touched one field would be misleading about what it actually does.
- **`addConditionalEdges` takes the source node, the routing function, and a path map - same three-argument shape as Python's `add_conditional_edges`.** Recognizing this pattern once means porting the next branching graph is mostly a syntax translation, not a new design.

## Why This Matters in Production

The same "let the pipeline genuinely branch based on real data" pattern now exists on both sides of our stack, using each side's own real graph library rather than reinventing one. Whichever side of the project needs a workflow that can route to a different path depending on what it finds, the pattern - and the working code - is already proven on both.
