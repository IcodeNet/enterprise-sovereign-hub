import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const SwarmVoteSchema = z.object({
  workerId: z.string(),
  proposedSolution: z.string().describe("Selected architecture choice."),
  confidenceScore: z.number().describe("Confidence rating between 0.0 and 1.0."),
});

type SwarmVote = z.infer<typeof SwarmVoteSchema>;

const FinalConsensusSchema = z.object({
  winningSolution: z.string(),
  voteCount: z.number(),
  rationale: z.string(),
});

type FinalConsensus = z.infer<typeof FinalConsensusSchema>;

// Cheap, independent workers, all given the SAME question in parallel. The
// value of a swarm comes from having several independent opinions to
// compare, not from any one worker being especially smart - a single
// expensive model call has no "second opinion" of its own to check itself
// against.
async function runWorkerVote(
  prompt: string,
  workerNumber: number,
  workerCount: number,
): Promise<SwarmVote> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SwarmVoteSchema,
    system: "We are an independent software worker node voting on architectural patterns.",
    prompt:
      `You are worker node #${workerNumber} of ${workerCount}. ` +
      `Set workerId to exactly 'worker-${workerNumber}'. ` +
      `Independently evaluate this requirement and propose your own solution: ${prompt}`,
  });
  return object;
}

async function runSwarmVote(prompt: string, workerCount = 3): Promise<FinalConsensus> {
  console.log(`Step 1: Dispatching task to ${workerCount} parallel swarm workers...`);

  // Independent, CONCURRENT calls (Promise.all, same tool as Day 8's
  // batching) - not one worker informed by another's answer.
  const votes = await Promise.all(
    Array.from({ length: workerCount }, (_, i) => runWorkerVote(prompt, i + 1, workerCount)),
  );

  console.log("\n--- Swarm Votes Collected ---");
  for (const vote of votes) {
    console.log(
      `Worker ${vote.workerId}: Proposed '${vote.proposedSolution}' (Confidence: ${vote.confidenceScore})`,
    );
  }

  console.log("\nStep 2: Tallying consensus with Tally Agent...");
  const { object: finalConsensus } = await generateObject({
    model: openai("gpt-4o"),
    schema: FinalConsensusSchema,
    system: "We analyze votes from swarm worker nodes and determine the final winning consensus.",
    prompt: `User Requirement: ${prompt}\nVotes: ${JSON.stringify(votes)}`,
  });

  return finalConsensus;
}

async function main() {
  const taskPrompt =
    "Select the best state machine engine for multi-agent loops: LangGraph, Pydantic AI, or FastMCP.";
  const result = await runSwarmVote(taskPrompt, 3);

  console.log("\n--- Final Swarm Consensus ---");
  console.log(`Winning Architecture: ${result.winningSolution}`);
  console.log(`Vote Tally: ${result.voteCount}`);
  console.log(`Rationale: ${result.rationale}`);
}

main().catch(console.error);
