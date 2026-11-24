This is Day 15's TypeScript side: the same swarm-voting pattern, and a genuinely different result from the Python run on the exact same question - which turned out to be the whole point of this lesson's finding.

---

## Agent Swarms — Day 15 (TS Port): Decentralized Consensus Voting

### The Problem We're Solving

Same problem as the Python lesson: a single AI call is a single point of failure, so run several independent workers on the same question in parallel and have a separate tally agent decide the winner.

**A real, cross-language finding worth stating plainly**: this TypeScript run, using `gpt-4o-mini` workers, unanimously voted for **LangGraph** - the technically correct answer to "which of LangGraph, Pydantic AI, or FastMCP is the best state machine engine for multi-agent loops." The Python lesson's runs, using the SAME model (`gpt-4o-mini`), unanimously (and then by majority) voted for **FastMCP** - the technically wrong answer - across two separate runs. Both languages ran identical logic, near-identical prompts, and the same underlying worker model, and got different consistent answers.

This is genuinely useful evidence, not a discrepancy to paper over: consensus voting's reliability depends heavily on the exact prompt wording and the specific model's own biases on that exact question - it is not a guarantee that independently-run "swarms" will converge on the same, correct answer just because they're using the same underlying model family.

Focus: the same parallel-voting pattern in TypeScript, worker-identity fix included
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| one worker's vote shape (`class SwarmVote(BaseModel)`) | one worker's vote shape (`const SwarmVoteSchema = z.object({...})`) |
| the final tally shape (`class FinalConsensus(BaseModel)`) | the final tally shape (`const FinalConsensusSchema = z.object({...})`) |
| one worker (`worker_agent = Agent("openai:gpt-4o-mini", output_type=SwarmVote)`) | one worker (`runWorkerVote()` calling `generateObject({ model: openai("gpt-4o-mini"), schema: SwarmVoteSchema })`) |
| running the workers in parallel (`await asyncio.gather(*tasks)`) | running the workers in parallel (`await Promise.all(...)`) |
| tallying the votes (`await tally_agent.run(tally_input)`) | tallying the votes (`await generateObject({ model: openai("gpt-4o"), schema: FinalConsensusSchema, ... })`) |
| reading the winner (`result.winning_solution`) | reading the winner (`result.winningSolution`) |

### Step 1: No New Dependencies

This lesson uses the Vercel AI SDK, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/web/src/agents/`, create:
`swarm-consensus.ts`

### Step 3: Add the Source Code

```typescript
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

async function runWorkerVote(prompt: string, workerNumber: number, workerCount: number): Promise<SwarmVote> {
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

  const votes = await Promise.all(
    Array.from({ length: workerCount }, (_, i) => runWorkerVote(prompt, i + 1, workerCount)),
  );

  console.log("\n--- Swarm Votes Collected ---");
  for (const vote of votes) {
    console.log(`Worker ${vote.workerId}: Proposed '${vote.proposedSolution}' (Confidence: ${vote.confidenceScore})`);
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
  const taskPrompt = "Select the best state machine engine for multi-agent loops: LangGraph, Pydantic AI, or FastMCP.";
  const result = await runSwarmVote(taskPrompt, 3);

  console.log("\n--- Final Swarm Consensus ---");
  console.log(`Winning Architecture: ${result.winningSolution}`);
  console.log(`Vote Tally: ${result.voteCount}`);
  console.log(`Rationale: ${result.rationale}`);
}

main().catch(console.error);
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/agents/swarm-consensus.ts
```

This run's swarm unanimously and confidently voted for LangGraph - the correct answer - directly contradicting the Python lesson's own two runs on the identical question with the identical worker model. Side by side:

| Run | Language | Worker Model | Result | Correct? |
|---|---|---|---|---|
| 1 | Python | gpt-4o-mini | FastMCP (3/3 unanimous) | No |
| 2 | Python | gpt-4o-mini | FastMCP (2/3 majority) | No |
| 3 | TypeScript | gpt-4o-mini | LangGraph (3/3 unanimous) | Yes |

Same model, same question, three runs, two different confident consensus outcomes.

---

## Best Practices

- **A cross-language port of the exact same lesson is a legitimate way to get a second, independent trial of a probabilistic system.** Running the same idea twice in two different languages isn't redundant work here - it's what surfaced the run-to-run inconsistency in the first place.
- **Report a contradictory result plainly, with the actual numbers, rather than only reporting whichever run happened to look good.** A doc that only showed the TypeScript LangGraph run would be quietly misleading about how reliable this pattern actually is.
- **Treat "the swarm agreed" as weak evidence, always check it against an independent source (a second run, a different model, a human) before trusting a surprising result** - unanimity is cheap to produce and easy to be systematically wrong about.

## Why This Matters in Production

This lesson's most valuable output isn't the working code - it's the honest, reproducible finding that identical consensus-voting logic, run twice on the same question with the same model, can land on two different confident "final" answers. Any system built on AI consensus needs a way to catch that kind of instability, not just a working happy-path demo.
