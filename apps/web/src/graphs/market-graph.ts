import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import * as z from "zod";

// A workflow's state is the shared notebook every node reads from and
// writes to. StateSchema (backed by Zod here) is LangGraph.js's typed
// version of Day 5's Python TypedDict - a typo in a field name is caught
// immediately instead of silently returning undefined deep in a later node.
const MarketState = new StateSchema({
  jobQuery: z.string(),
  identifiedSkill: z.string(),
  demandLevel: z.string(),
  finalReport: z.string(),
});

// Node 1: ask the AI to pull the one skill name out of a messy job posting,
// so every later node can work with a single clean word instead of parsing
// free text itself.
async function extractSkillNode(state: typeof MarketState.State) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "Extract the primary technical skill name (e.g., LangGraph, Pydantic AI) from the user's job query. Reply with only the skill name.",
    prompt: state.jobQuery,
  });
  return { identifiedSkill: text.trim() };
}

// Node 2: decide, from a small fixed list, whether this is one of our core
// target skills or something else. This node doesn't call the AI at all -
// a plain, fast, deterministic check is enough here.
async function evaluateDemandNode(state: typeof MarketState.State) {
  const skill = state.identifiedSkill.toLowerCase();
  const targetStack = ["langgraph", "pydantic", "vercel ai", "llamaindex"];
  const demand = targetStack.some((target) => skill.includes(target))
    ? "HIGH_DEMAND"
    : "STANDARD_DEMAND";
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
// in one fixed straight line. LangGraph calls this after evaluateDemandNode
// finishes, and whichever node name comes back is the one that runs next -
// the graph itself decides its own path at run time, based on real data.
function routeByDemand(
  state: typeof MarketState.State,
): "highPriorityEvaluator" | "standardEvaluator" {
  return state.demandLevel === "HIGH_DEMAND" ? "highPriorityEvaluator" : "standardEvaluator";
}

// Wires the four nodes together into one graph: a fixed start, a fixed
// middle step, then a branch point that leads to exactly one of the two
// final nodes depending on what evaluateDemandNode decided.
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

// Starts the test: runs the whole graph on one real job query, and prints
// which branch it actually took plus the final report from that branch.
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
