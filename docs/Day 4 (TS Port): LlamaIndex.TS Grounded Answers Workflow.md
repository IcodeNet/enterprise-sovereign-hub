This is Day 4's TypeScript side: the same search-then-answer workflow as the Python lesson, using LlamaIndex.TS's own workflow engine instead of Pydantic AI's.

---

## Vercel AI SDK — Day 4 (TS Port): Grounded Answers with a Search-Then-Answer Workflow

### The Problem We're Solving

Same problem as the Python lesson: an AI model only knows what it was trained on, which means nothing about our own company, and it can sound confident while being wrong. The fix (RAG - Retrieval-Augmented Generation) is also the same: search our own stored facts for whatever is relevant to the question, then tell the AI to answer using ONLY that.

LlamaIndex has a genuine TypeScript version of the same workflow engine used in Day 4's Python lesson (`@llamaindex/workflow-core`), plus a TypeScript version of the document search library (`llamaindex`) - so this isn't a from-scratch reimplementation, it's the same real tool, just on the other side of our stack.

Focus: the same two-step search-then-answer pipeline, built with LlamaIndex's TypeScript workflow engine
Time investment: 20 minutes (assuming Day 4's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the messages passed between steps (`class QueryEvent(Event)`, `class RetrieveEvent(Event)`) | the messages passed between steps (`workflowEvent<{ query: string }>()`, `workflowEvent<{ query: string; context: string }>()`) |
| the workflow itself (`class SovereignRAGWorkflow(Workflow)` with `@step` methods) | the workflow itself (`withState(createWorkflow())` with `workflow.handle([queryEvent], ...)` handlers) |
| shared memory across steps (`await ctx.store.set("user_id", ...)`) | shared memory across steps (`context.state.userId`, typed by `RagWorkflowState`) |
| searching the stored facts (`index.as_retriever(similarity_top_k=2)` then `await retriever.aretrieve(ev.query)`) | searching the stored facts (`index.asRetriever({ similarityTopK: 2 })` then `await retriever.retrieve({ query: data.query })`) |
| running it (`await rag_flow.run(query=..., user_id=...)`) | running it (`sendEvent(queryEvent.with({ query: ... }))` then `await stream.until(stopEvent).toArray()`) |
| reading the final answer (`StopEvent(result=str(response))`) | reading the final answer (`stopEvent.with({ result: text })`) |

### Step 1: Install the Packages

Inside `apps/web`:

```bash
npm install @llamaindex/workflow-core llamaindex @llamaindex/openai --legacy-peer-deps
```

*(Note: `--legacy-peer-deps` was needed because `@llamaindex/workflow-core`'s declared compatible Next.js version was slightly behind the one already installed in this project - this is a real, common friction point in a fast-moving ecosystem, not a sign anything is broken.)*

### Step 2: Create the Source File

Inside `apps/web/src/workflows/`, create:
`rag-workflow.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { createWorkflow, workflowEvent } from "@llamaindex/workflow-core";
import { createStatefulMiddleware } from "@llamaindex/workflow-core/middleware/state";
import { Document, MetadataMode, VectorStoreIndex } from "llamaindex";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { Settings } from "llamaindex";
import { generateText } from "ai";

Settings.embedModel = new OpenAIEmbedding();

// The shape of information this workflow carries between its steps: which
// user asked. Typing this means a typo in a property name is caught
// immediately instead of silently returning "undefined" deep in a later step.
type RagWorkflowState = {
  userId: string;
};

const { withState } = createStatefulMiddleware((state: RagWorkflowState) => state);

// Defines the three messages that flow through this pipeline: the starting
// question, the question plus what was found by searching, and the final
// generated answer.
const queryEvent = workflowEvent<{ query: string }>();
const retrieveEvent = workflowEvent<{ query: string; context: string }>();
const stopEvent = workflowEvent<{ result: string }>();

const workflow = withState(createWorkflow());

// Step 1: search a small set of stored facts for whatever is relevant to
// the question - this is what makes the AI's final answer grounded in real
// facts instead of it guessing.
workflow.handle([queryEvent], async (context, { data }) => {
  const sampleDocuments = [
    new Document({ text: "A fintech platform specializes in savings accounts and payments." }),
    new Document({
      text: "The Sovereign Intelligence Hub is built using Pydantic AI, LlamaIndex, and Vercel AI SDK.",
    }),
    new Document({ text: "Type-safe AI agents enforce deterministic schemas across microservices." }),
  ];

  const index = await VectorStoreIndex.fromDocuments(sampleDocuments);
  const retriever = index.asRetriever({ similarityTopK: 2 });
  const retrievedNodes = await retriever.retrieve({ query: data.query });

  const contextText = retrievedNodes
    .map((node) => node.node.getContent(MetadataMode.NONE))
    .join("\n");

  return retrieveEvent.with({ query: data.query, context: contextText });
});

// Step 2: hand the retrieved facts plus the question to the AI, telling it to
// answer ONLY from what was retrieved.
workflow.handle([retrieveEvent], async (context, { data }) => {
  const { userId } = context.state;

  const prompt =
    `Context:\n${data.context}\n\n` +
    `User (${userId}) Question: ${data.query}\n\n` +
    "Provide a precise engineering answer based ONLY on the above context.";

  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt,
  });

  return stopEvent.with({ result: text });
});

async function main() {
  const { stream, sendEvent } = workflow.createContext({ userId: "byron_lead_dev" });

  console.log("Executing LlamaIndex Workflow (TypeScript)...");
  sendEvent(queryEvent.with({ query: "What frameworks power the Sovereign Intelligence Hub?" }));

  const results = await stream.until(stopEvent).toArray();
  const finalResult = results[results.length - 1]?.data as { result: string } | undefined;

  console.log("\n--- Final Grounded Output ---");
  console.log(finalResult?.result ?? "(no result)");
}

main().catch(console.error);
```

### Step 4: Run and Verify

```bash
cd apps/web
npx tsx src/workflows/rag-workflow.ts
```

You should see the same kind of grounded answer as the Python version - naming the actual frameworks from the stored document, not a guess.

---

## Best Practices

- **Events are typed, and each step handles only one kind of event.** `queryEvent`, `retrieveEvent`, and `stopEvent` each carry a specific, named shape of data - this is what lets the workflow engine know which step should run next, purely from the event's type, without any manual "which function comes next" wiring.
- **`context.state` carries shared data across steps, not a global variable.** Passing `userId` through the typed workflow state (rather than a module-level variable) keeps each run of the workflow isolated from any other run happening at the same time.
- **Check a real content-getter's actual signature before assuming it needs no arguments.** `node.getContent()` looked like it should work with no arguments from the Python equivalent's habits, but this version's TypeScript types required an explicit `MetadataMode.NONE` - caught immediately by running `tsc`, not by a runtime surprise.

## Why This Matters in Production

The same grounded, search-then-answer pattern from Day 4's Python lesson now exists on both sides of our stack, using each side's own real tools rather than reinventing one from scratch in the other language. Whichever side of the project ends up needing a "search our own facts, then answer" feature, the pattern - and now the working code - is already proven on both.

## Density Add-On: Evidence Pack Contract

In TypeScript, add a typed evidence pack instead of passing plain context text only.

Minimum fields
- `sourceId`
- `retrievalMethod`
- `score`
- `excerpt`
- `provenance`

Why this helps
- You can show exactly what data grounded each answer.
- You can test retrieval quality separately from answer quality.

Practice checkpoint
- Create an `EvidenceRecord` interface.
- Build `evidence: EvidenceRecord[]` in the retrieval step.
- Log one compact evidence table before generation.
