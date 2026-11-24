Day 4 is about grounding an AI's answer in real facts, so it can't just make things up — using LlamaIndex, split into small independent steps (a "workflow") the same way a real pipeline is built.

---

## Pydantic AI — Day 4: Grounded Answers with a Search-Then-Answer Workflow

### The Problem We're Solving

An AI model answers from what it already knows — its training data — which has two problems for us: it doesn't know anything specific to our own company or project, and it can sound confident while being simply wrong (this is usually called "hallucinating"). Neither is acceptable for an assistant that engineers actually rely on.

The fix is a pattern called RAG (Retrieval-Augmented Generation): before the AI answers, we search our own stored facts for whatever is relevant to the question, then tell the AI "answer using ONLY this information." The answer is now traceable back to a real document instead of coming from the AI's own memory.

Days 1-3 were each a single step: ask, get a structured answer, or stream a reply. Day 4 introduces a genuine multi-step pipeline — a **workflow** — where each step does one job and hands its result to the next step automatically:

1. **Search step**: take the question, search our stored facts for what's relevant.
2. **Generate step**: hand the question plus the search results to the AI, and tell it to answer only from that.

Splitting search and generation into two separate steps (instead of one big function that does both) means either step can be tested, replaced, or reordered on its own — e.g. swapping in a real database instead of a handful of sample sentences, without touching how the AI generates its answer.

Focus: searching by *meaning*, then generating an answer grounded in what was found
Time investment: 25 minutes

### Step 1: Install LlamaIndex

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install llama-index-core llama-index-llms-openai llama-index-embeddings-openai
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/workflows/`, create:
`rag_workflow.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex
from llama_index.core.schema import Document, NodeWithScore
from llama_index.core.workflow import Context, Event, StartEvent, StopEvent, Workflow, step
from llama_index.llms.openai import OpenAI

load_dotenv()


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


# A Workflow is a small pipeline made of steps. Each step receives one kind of
# event and, once it's done its job, emits the next event - the next step
# that knows how to handle that event type runs automatically.
class SovereignRAGWorkflow(Workflow):
    @step
    async def prepare_retrieval(self, ctx: Context, ev: StartEvent) -> QueryEvent:
        """Step 1: Parse the incoming StartEvent and prepare context."""
        query = ev.get("query", "")
        # Context.store is shared memory across every step in this run, so a
        # later step can read something an earlier step saved.
        await ctx.store.set("user_id", ev.get("user_id", "anonymous"))
        return QueryEvent(query=query)

    @step
    async def retrieve_documents(self, ctx: Context, ev: QueryEvent) -> RetrieveEvent:
        """Step 2: Vector search against indexed documents."""
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

        return RetrieveEvent(query=ev.query, nodes=retrieved_nodes)

    @step
    async def generate_response(self, ctx: Context, ev: RetrieveEvent) -> StopEvent:
        """Step 3: Synthesize context and generate final grounded response."""
        context_text = "\n".join([node.node.get_content() for node in ev.nodes])
        user_id = await ctx.store.get("user_id")

        prompt = (
            f"Context:\n{context_text}\n\n"
            f"User ({user_id}) Question: {ev.query}\n\n"
            "Provide a precise engineering answer based ONLY on the above context."
        )

        llm = OpenAI(model="gpt-4o")
        response = await llm.acomplete(prompt)

        return StopEvent(result=str(response))


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
```

### Step 4: Run and Verify

```bash
python src/workflows/rag_workflow.py
```

With `verbose=True`, you'll see every step run in order, and the final answer will name the frameworks from the stored document, not a guess.

---

## Best Practices

- **Search by meaning, not by exact keyword.** A vector search (used here) can match "What frameworks power the hub?" against a sentence that never uses the word "power" or "frameworks" literally, because it compares meaning, not spelling — Day 2's exact-match tool lookup couldn't do this.
- **Tell the AI explicitly to answer only from what was retrieved.** Skipping this instruction lets the AI quietly blend in its own general knowledge, defeating the whole point of grounding the answer in real facts.
- **Split search and generation into separate steps, not one function.** It's what let us verify the search step's output on its own before trusting the final answer, and what would let us later swap in a real database without touching how the answer gets generated.

## Why This Matters in Production

Any answer this hub gives about our own systems, our own docs, or our own decisions has to be grounded in something real, not the AI's general training data - which knows nothing about our internal systems specifically and can be confidently wrong. This is the pattern that makes a "search first, then answer" AI agent possible, and it will only get more useful as more of our real documents replace the three sample sentences in the code above.

## Density Add-On: Evidence Pack Contract

Do not pass raw context text only. Add a typed evidence pack.

Minimum fields
- `source_id`: stable source identifier
- `retrieval_method`: dense, sparse, graph, or hybrid
- `score`: retrieval score
- `excerpt`: short text used by the model
- `provenance`: where it came from (doc/chunk/tool)

Why this helps
- You can audit exactly what the model saw.
- You can compare retrieval quality over time.
- You can debug bad answers faster.

Practice checkpoint
- Keep the current answer flow.
- Add one evidence-pack printout before generation.
- Confirm each output line can be traced to one evidence record.
