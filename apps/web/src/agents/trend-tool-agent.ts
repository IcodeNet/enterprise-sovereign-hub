import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { fetchLiveSkillCount } from "./skill-demand-tool.js";

// Starts the test: asks the AI a question that requires it to actually call the tool
// above to get a real number before it can give a useful answer.
async function main(): Promise<void> {
  const prompt =
    "Check live demand for Pydantic AI in our database and evaluate if we should prioritize it.";

  console.log("Executing agent query with a live tool call...");

  // Sends the question to the AI along with the tool it's allowed to use. The AI decides
  // on its own to call fetchLiveSkillCount first, then writes its answer using the result.
  // stopWhen lets it take more than one step: one to call the tool, one to reply.
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are a principal AI systems architect. " +
      "Use the provided tool to query live database metrics before making recommendations.",
    prompt,
    tools: { fetchLiveSkillCount },
    stopWhen: stepCountIs(3),
  });

  console.log("\n--- Agent Result ---");
  console.log(text);
}

main();
