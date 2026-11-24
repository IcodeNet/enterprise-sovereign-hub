This is the TypeScript twin of Day 2's Python lesson. Same idea, different side of our project: give the AI a live fact-checking tool instead of letting it guess, and hand it fresh data at the moment it runs instead of baking that data into its setup.

---

## Vercel AI SDK — Day 2 (TS Port): Live Tools & Fresh Data

### The Problem We're Solving

An AI only knows what it learned during training and whatever you type into the prompt right now. It cannot see today's real numbers — a live database count, today's price, this request's user — unless you hand it a way to go and check. Without that, it either makes something up or you're stuck writing custom code around every single call to fetch the real number yourself and stitch it into the prompt by hand.

Focus: giving the AI a tool it can call itself, mid-answer, to fetch a real number before replying
Time investment: 15 minutes

Day 2's Python lesson does this with a decorated tool function plus a small live-data bundle. The Vercel AI SDK's version is a `tool()` helper passed into the AI call, with a setting that allows more than one back-and-forth round-trip — one round to let the AI call the tool, one more to let it write its final answer using what the tool returned.

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| a tool function the AI can call (`@agent.tool` decorator) | a tool the AI can call (`tool({ description, inputSchema, execute })`) |
| the live-data bundle handed to the AI at run time (`RunContext[DatabaseDeps]`) | a plain variable the tool function can read |
| setting up the AI with the tool and shape (`Agent(deps_type=..., output_type=...)`) | asking the AI with the tool (`generateText({ tools: {...}, stopWhen: stepCountIs(N) })`) |
| running it (`await agent.run(prompt, deps=mock_deps)`) | running it (`await generateText({ ..., prompt })`) |

### Step 1: Create the Agent Source File

Inside `apps/web`, create:
`src/agents/trend-tool-agent.ts`

### Step 2: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

// Defines a small fake database of live job-posting counts per skill, the same "live"
// data the AI can't already know and must ask a tool for instead of guessing.
const skillDatabase: Record<string, number> = {
  "pydantic ai": 142,
  "vercel ai sdk": 98,
  llamaindex: 85,
};

// Gives the AI a tool it can call mid-answer: a function that looks up a skill's live
// count in the fake database above, instead of the AI guessing the number itself.
// The "description" and the field description below are both read by the AI, exactly
// like Day 2's Python tool docstring and its own field descriptions.
const fetchLiveSkillCount = tool({
  description: "Queries our internal database for current live job posting counts for a skill.",
  inputSchema: z.object({
    skillName: z.string().describe("The exact technical skill to look up, e.g. 'Pydantic AI'."),
  }),
  execute: async ({ skillName }) => {
    const formattedKey = skillName.toLowerCase().trim();
    // The AI sometimes shortens the skill name it was asked about (e.g. "Pydantic"
    // instead of "Pydantic AI") before calling this tool. An exact match would silently
    // return 0 for a real skill just because the wording didn't match — so we also accept
    // a database key that starts with what the AI sent, to catch that shortening.
    const exactMatch = skillDatabase[formattedKey];
    if (exactMatch !== undefined) {
      return exactMatch;
    }
    const partialMatchKey = Object.keys(skillDatabase).find((key) => key.startsWith(formattedKey));
    return partialMatchKey ? skillDatabase[partialMatchKey] : 0;
  },
});

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
```

*(Note: while building this lesson, occasional runs gave a wrong final answer — the AI would say "no demand" for a skill that really did have 142 live postings. The cause wasn't the SDK or which OpenAI response style was used: it was the AI sometimes shortening the skill name before calling the tool (asking about "Pydantic" instead of "Pydantic AI"), and the tool doing an exact match, silently returning 0 for the shortened name. The `partialMatchKey` fallback above fixes this by also accepting a shortened name that's the start of a real database key. Always double-check that a tool's *actual* returned value matches the AI's final sentence — a tool returning the right answer to the wrong question looks identical to a tool being "broken" until you check what it was actually asked.)*

### Step 3: Set Up and Run It

From `apps/web` (the packages are shared with Day 1's TS port — no new installs needed if you've already run that):

```bash
npx tsx src/agents/trend-tool-agent.ts
```

---

## Best Practices

- **Give the AI a way to check a fact instead of a way to guess it.** A tool call that returns a real number beats a prompt that hopes the AI remembers or invents something plausible-sounding.
- **Always double-check that a tool's real result matches the AI's final sentence, not just that nothing crashed.** As this lesson found firsthand, a tool can return the right number while the AI's final answer still contradicts it — that's a real mistake that "it ran without errors" alone won't catch.
- **Write the tool's description and its expected input for the AI, not just for future developers.** Those descriptions are sent to the AI as part of its instructions and directly affect whether it calls the tool at the right moment with the right input.
- **Set a firm limit on how many back-and-forth steps the AI can take.** Without one, an AI that's allowed to call tools has no natural stopping point and can, on a bad day, keep calling tools indefinitely.

## Why This Port Matters in Production

The same "let the AI check real facts instead of guessing" idea from the Python side now works on the web-facing TypeScript side too. This is the real building block of "agentic" AI: the model isn't just answering from what it already knows, it's actively deciding when it needs more information and going to get it — on either side of our project, with the same guarantee of a real answer instead of a plausible-sounding invented one.

## Addendum: Wiring This Tool Into the Live Chat App

The standalone script above (`trend-tool-agent.ts`) proves the idea in isolation, but it never actually touched the production chat experience — `app/api/chat/route.ts` only ever called plain `streamText` with no backend tools of its own. We moved `fetchLiveSkillCount` into a shared module, `src/agents/skill-demand-tool.ts`, and imported it into both the standalone script and the live route, so the same tool backs both.

```typescript
// app/api/chat/route.ts
import { fetchLiveSkillCount } from "@/src/agents/skill-demand-tool";
// ...
const result = streamText({
  model: openai("gpt-4o"),
  messages: modelMessages,
  tools: { ...frontendTools(tools ?? {}), fetchLiveSkillCount },
  stopWhen: stepCountIs(3),
  system: /* ... now also tells the model to use the tool before recommending a skill */,
});
```

Verified live, not just claimed: asked the real chat UI (running on `localhost:3001/chat`) "Check live demand for Pydantic AI in our database and tell me the exact number." assistant-ui's Thread rendered a **"Used tool: fetchLiveSkillCount"** badge, and the final answer correctly reported "142 postings" — the real number from the shared database, not an invented one.
