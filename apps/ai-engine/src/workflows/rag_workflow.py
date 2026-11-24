import asyncio
import json
from typing import TypedDict

from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex
from llama_index.core.schema import Document, NodeWithScore
from llama_index.core.workflow import Context, Event, StartEvent, StopEvent, Workflow, step
from llama_index.llms.openai import OpenAI

load_dotenv()


class EvidenceRecord(TypedDict):
    source_id: str
    retrieval_method: str
    score: float
    excerpt: str
    provenance: str


# Defines the shape of the message passed from the first step to the second:
# the search question, once it's been pulled out of the incoming request.
class QueryEvent(Event):
    """Event emitted after initial query processing."""

    query: str


# Defines the shape of the message passed from the second step to the third:
# the same question, plus whichever stored documents the search actually found.
class RetrieveEvent(Event):
    """Event carrying retrieved document nodes."""

    query: str
    nodes: list[NodeWithScore]
    evidence_pack: list[EvidenceRecord]


# A Workflow is a small pipeline made of steps. Each step receives one kind of
# event and, once it's done its job, emits the next event — the next step that
# knows how to handle that event type runs automatically. This keeps each step
# focused on one job and free to be tested, replaced, or reordered on its own,
# instead of one big function that does search-then-generate as one lump.
class SovereignRAGWorkflow(Workflow):
    @step
    async def prepare_retrieval(self, ctx: Context, ev: StartEvent) -> QueryEvent:
        """Step 1: Parse the incoming StartEvent and prepare context."""
        query = ev.get("query", "")
        # Context.store is shared memory across every step in this run, so a
        # later step can read something an earlier step saved, without it
        # being passed as a parameter through every function in between.
        await ctx.store.set("user_id", ev.get("user_id", "anonymous"))
        return QueryEvent(query=query)

    @step
    async def retrieve_documents(self, ctx: Context, ev: QueryEvent) -> RetrieveEvent:
        """Step 2: Vector search against indexed documents."""
        # A small in-memory set of facts, standing in for a real document
        # store. This is what makes the AI's final answer grounded in real
        # facts instead of it guessing from what it already knows — the same
        # idea as Day 2's live-data tool, just searched by meaning instead of
        # looked up by an exact key.
        sample_documents = [
            Document(text="A fintech platform specializes in savings accounts and payments."),
            Document(
                text="The Sovereign Intelligence Hub is built using Pydantic AI, LlamaIndex, and Vercel AI SDK."
            ),
            Document(text="Type-safe AI agents enforce deterministic schemas across microservices."),
        ]

        index = VectorStoreIndex.from_documents(sample_documents)
        retriever = index.as_retriever(similarity_top_k=2)
        retrieved_nodes = await retriever.aretrieve(ev.query)
        evidence_pack: list[EvidenceRecord] = []
        for idx, node in enumerate(retrieved_nodes, start=1):
            source_id = getattr(node.node, "node_id", f"retrieved_{idx}")
            evidence_pack.append(
                {
                    "source_id": source_id,
                    "retrieval_method": "dense",
                    "score": float(node.score or 0.0),
                    "excerpt": node.node.get_content(),
                    "provenance": "vector_index_sample_documents",
                }
            )

        return RetrieveEvent(query=ev.query, nodes=retrieved_nodes, evidence_pack=evidence_pack)

    @step
    async def generate_response(self, ctx: Context, ev: RetrieveEvent) -> StopEvent:
        """Step 3: Synthesize context and generate final grounded response."""
        context_text = "\n".join([evidence["excerpt"] for evidence in ev.evidence_pack])
        user_id = await ctx.store.get("user_id")

        print("\n--- Evidence Pack ---")
        print(json.dumps(ev.evidence_pack, indent=2))

        # Telling the AI to answer ONLY from the retrieved facts is what makes
        # this "grounded" — the answer is traceable back to real documents
        # instead of the AI's own general knowledge, which might be wrong or
        # out of date for something specific to our own project.
        prompt = (
            f"Context:\n{context_text}\n\n"
            f"User ({user_id}) Question: {ev.query}\n\n"
            "Provide a precise engineering answer based ONLY on the above context."
        )

        llm = OpenAI(model="gpt-4o")
        response = await llm.acomplete(prompt)

        return StopEvent(result=str(response))


# Starts the test: runs the whole three-step pipeline on one real question,
# and prints the final answer once all three steps have completed.
async def main():
    rag_flow = SovereignRAGWorkflow(timeout=30, verbose=True)

    print("Executing LlamaIndex Workflow...")
    result = await rag_flow.run(
        query="What frameworks power the Sovereign Intelligence Hub?",
        user_id="byron_lead_dev",
    )

    print("\n--- Final Grounded Output ---")
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
