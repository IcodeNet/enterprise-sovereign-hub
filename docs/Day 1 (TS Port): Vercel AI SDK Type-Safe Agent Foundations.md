This is the TypeScript twin of Day 1's Python lesson (`Day 1: Type-Safe Agent Foundations.md`). Both teach the same idea — making an AI always answer in a fixed, checkable shape instead of loose sentences — just on different sides of our project: Python for the AI/backend layer, TypeScript for our web pages. Read either one first; this doc explains the idea again from scratch.

---

## Vercel AI SDK — Day 1 (TS Port): Type-Safe Agent Foundations

### The Problem We're Solving

The same problem as Day 1, just on the web-facing side of our project: whatever serves our web pages also needs a guaranteed, checkable answer back from the AI, not a paragraph to pick apart by hand. If each side of the project solved this differently, we'd end up maintaining two separate checking systems for the exact same problem.

Focus: forcing an AI's answer into a strict, checked shape, the TypeScript way
Time investment: 15 minutes

Day 1's Python lesson does this by handing the AI a description of the expected shape and forcing every answer to match it. The Vercel AI SDK's version of the same idea is a function called `generateObject()`: instead of asking the AI to just "write text" and hoping it happens to come back as usable data, we hand it a description of the shape we expect and the tool guarantees the answer matches it, trying again automatically if the AI's first attempt doesn't fit.

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the expected answer shape (`class MarketInsight(BaseModel)`) | the expected answer shape (`const MarketInsight = z.object({...})`) |
| setting up the AI with that shape (`Agent("openai:gpt-4o", output_type=MarketInsight)`) | asking the AI with that shape (`generateObject({ model: openai("gpt-4o"), schema: MarketInsight })`) |
| running it (`await market_agent.run(sample_job)`) | running it (`await generateObject({ ..., prompt: sampleJob })`) |
| reading the checked answer (`result.output`) | reading the checked answer (`{ object: data }`) |

### Step 1: Create the Agent Source File

Inside `apps/web`, create:
`src/agents/market-analyst.ts`

### Step 2: Add the Source Code

```typescript
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
```

### Step 3: Set Up the Package and Run It

From `apps/web`:

```bash
npm install ai @ai-sdk/openai zod dotenv tsx typescript
npm install --save-dev @types/node @types/json-schema
npx tsx src/agents/market-analyst.ts
```

*(Note: `apps/web` reuses `apps/ai-engine`'s settings file instead of keeping a second copy of the same API key — a shortcut link (`ln -s ../ai-engine/.env .env`) inside `apps/web` points at it. Both the settings file and the downloaded packages folder are excluded from version control per app, since neither should ever be shared or committed.)*

---

## Best Practices

- **Describe every expected field in plain English for the AI, not just as a code comment.** Those descriptions are sent to the AI as part of its instructions — it actually reads them, they're not just for humans reading the code later.
- **Let the checking tool own the retry loop — don't add your own fallback parsing on top of it.** That defeats the entire point of using a shape-checking tool instead of plain text generation.
- **Don't force an extra type hint onto the checking call when you've already given it a shape to check against.** The tool already knows the answer's shape from that description; adding a second, possibly mismatched hint just causes confusing errors instead of catching real bugs.
- **Check that your code compiles cleanly before spending an API call testing it.** It catches shape mismatches for free, without waiting on a real AI response first.

## Why This Port Matters in Production

This gives the web-facing side of our project the same guarantee Day 1 gave the Python side: a checked, shaped answer, not a string we have to pick apart and hope is well-formed. The same "make the AI's answer trustworthy" idea now works on both sides of our project without us maintaining two separate ways of doing it.
