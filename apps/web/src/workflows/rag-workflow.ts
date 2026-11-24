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
// user asked, and what we've found so far. Typing this (rather than passing
// loose untyped objects around) means a typo in a property name is caught
// immediately instead of silently returning "undefined" deep in a later step.
type RagWorkflowState = {
  userId: string;
};

interface EvidenceRecord {
  sourceId: string;
  retrievalMethod: "dense" | "sparse" | "graph" | "hybrid";
  score: number;
  excerpt: string;
  provenance: string;
}

const { withState } = createStatefulMiddleware((state: RagWorkflowState) => state);

// Defines the three messages that flow through this pipeline: the starting
// question, the question plus what was found by searching, and the final
// generated answer. A workflow is a small pipeline made of independent
// steps; each step only needs to know how to handle the ONE kind of event
// it cares about, which is what lets us test, replace, or reorder any single
// step without having to touch the others.
const queryEvent = workflowEvent<{ query: string }>();
const retrieveEvent = workflowEvent<{
  query: string;
  context: string;
  evidence: EvidenceRecord[];
}>();
const stopEvent = workflowEvent<{ result: string }>();

const workflow = withState(createWorkflow());

// Step 1: search a small set of stored facts for whatever is relevant to
// the question. This is what makes the AI's final answer grounded in real
// facts instead of it guessing from what it already knows — the same idea
// as Day 2's live-data tool, just searched by meaning instead of looked up
// by an exact key.
workflow.handle([queryEvent], async (context, { data }) => {
  const sampleDocuments = [
    new Document({
      text: "A fintech platform specializes in savings accounts and payments.",
    }),
    new Document({
      text: "The Sovereign Intelligence Hub is built using Pydantic AI, LlamaIndex, and Vercel AI SDK.",
    }),
    new Document({
      text: "Type-safe AI agents enforce deterministic schemas across microservices.",
    }),
  ];

  const index = await VectorStoreIndex.fromDocuments(sampleDocuments);
  const retriever = index.asRetriever({ similarityTopK: 2 });
  const retrievedNodes = await retriever.retrieve({ query: data.query });

  const contextText = retrievedNodes
    .map((node) => node.node.getContent(MetadataMode.NONE))
    .join("\n");

  const evidence: EvidenceRecord[] = retrievedNodes.map((node, idx) => {
    // eslint-disable-next-line no-underscore-dangle -- llamaindex's own BaseNode.id_ property name
    const nodeId = node.node.id_;
    return {
      sourceId: nodeId ?? `retrieved_${idx + 1}`,
      retrievalMethod: "dense",
      score: Number(node.score ?? 0),
      excerpt: node.node.getContent(MetadataMode.NONE),
      provenance: "vector_index_sample_documents",
    };
  });

  return retrieveEvent.with({ query: data.query, context: contextText, evidence });
});

// Step 2: hand the retrieved facts plus the question to the AI, telling it to
// answer ONLY from what was retrieved. That restriction is what makes this
// "grounded" — the answer is traceable back to real documents instead of the
// AI's own general knowledge, which might be wrong or out of date for
// something specific to our own project.
workflow.handle([retrieveEvent], async (context, { data }) => {
  const { userId } = context.state;

  console.log("\n--- Evidence Pack ---");
  console.log(JSON.stringify(data.evidence, null, 2));

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

// Starts the test: runs the whole two-step pipeline on one real question,
// and prints the final answer once both steps have completed.
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
