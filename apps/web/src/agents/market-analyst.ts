import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Defines the exact shape the AI's answer must fit into: a skill name, a number 1-10
// showing demand, and a one-sentence reason — with each field's meaning spelled out for the AI.
const MarketInsight = z.object({
  skillName: z.string().describe("The exact name of the technical skill identified."),
  demandFrequency: z
    .number()
    .int()
    .describe("Frequency level found in text from 1 (low) to 10 (high)."),
  justification: z
    .string()
    .describe("A single clear sentence explaining why this skill is needed."),
});

type MarketInsight = z.infer<typeof MarketInsight>;

// Starts the test function, with a made-up job description fed in as the input to try it out on.
async function runAnalysis(): Promise<void> {
  const sampleJob =
    "Looking for an engineer to build production RAG systems. " +
    "Must be highly proficient in Pydantic AI to build type-safe agent graphs " +
    "and handle complex schema validation across backend microservices.";

  console.log("Sending text to agent...");

  // Sends the job description to the AI and forces its reply into the shape defined
  // above — if the model's first attempt doesn't fit, this retries until it does.
  const { object: data } = await generateObject({
    model: openai("gpt-4o"),
    schema: MarketInsight,
    system:
      "We are a principal AI systems engineer. " +
      "Our job is to analyze text and extract technical requirements cleanly.",
    prompt: sampleJob,
  });

  // Prints out each piece of that already-checked answer nicely.
  console.log("\n--- Validated Agent Output Received ---");
  console.log(`Skill: ${data.skillName}`);
  console.log(`Frequency Score: ${data.demandFrequency}/10`);
  console.log(`Justification: ${data.justification}`);
}

runAnalysis();
