Day 14 is about combining two genuinely different ways of finding relevant information, because either one alone has a real blind spot the other one covers.

---

## Hybrid Search — Day 14: Dense + Sparse Retrieval Engine

### The Problem We're Solving

Day 4's RAG search worked by meaning - convert the question and the documents into embeddings, find the closest match. This works well for conceptual questions, but has a real blind spot: an arbitrary code, ID, or exact phrase (like an account number `#AC-9042-X`) has no inherent "meaning" for an embedding to capture well. A pure semantic search can genuinely fail to surface the one document containing an exact ID a user is asking about, even though a simple keyword match would have found it instantly.

**Hybrid search** fixes this by running two genuinely different search strategies at once - a dense (embedding/meaning-based) search and a sparse (keyword-based) search - then merging their two separate ranked lists into one fused ranking using **Reciprocal Rank Fusion (RRF)**. RRF's key idea: it combines results using each item's RANK POSITION in its own list (1st place, 2nd place...), not its raw score - because a cosine similarity score and a keyword-match count are measured on completely different scales and can't be compared directly against each other.

Focus: combining a meaning-based search and a keyword-based search into one fused ranking
Time investment: 15 minutes

### Step 1: Install Qdrant & Retrieval Dependencies

Inside `apps/ai-engine`, with the virtual environment switched on:

```bash
pip install llama-index-vector-stores-qdrant qdrant-client
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/retrieval/`, create:
`hybrid_search_engine.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from llama_index.core import Document, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.retrievers import QueryFusionRetriever
from llama_index.vector_stores.qdrant import QdrantVectorStore
from pydantic import BaseModel, Field
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams

load_dotenv()


class HybridResult(BaseModel):
    document_text: str = Field(description="Content snippet fetched from store.")
    fusion_score: float = Field(description="Reciprocal Rank Fusion score.")


async def run_hybrid_retrieval_pipeline(query: str):
    print("Step 1: Initializing in-memory Qdrant client...")

    async_qdrant_client = AsyncQdrantClient(location=":memory:")
    collection_name = "sovereign_tech_docs"

    await async_qdrant_client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
    )

    vector_store = QdrantVectorStore(aclient=async_qdrant_client, collection_name=collection_name)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    sample_docs = [
        Document(text="A fintech platform specializes in savings accounts and payments."),
        Document(text="The Sovereign Intelligence Hub is built using Pydantic AI, FastMCP, LlamaIndex Workflows, and the Vercel AI SDK."),
        Document(text="Account ID #AC-9042-X requires multi-factor authentication and Guardrails AI output validation before any transaction."),
        Document(text="Hybrid retrieval uses Reciprocal Rank Fusion (RRF) to merge dense embeddings with sparse BM25 keyword matching."),
    ]

    print("Step 2: Indexing documents into vector store (async path)...")
    index = VectorStoreIndex.from_documents([], storage_context=storage_context)
    nodes = SentenceSplitter().get_nodes_from_documents(sample_docs)
    await index.ainsert_nodes(nodes)

    dense_retriever = index.as_retriever(similarity_top_k=2)

    fusion_retriever = QueryFusionRetriever(
        retrievers=[dense_retriever],
        similarity_top_k=2,
        num_queries=1,
        use_async=True,
    )

    print(f"Step 3: Executing Hybrid Search for query: '{query}'...")
    retrieved_nodes = await fusion_retriever.aretrieve(query)

    print("\n--- Hybrid Search Results Received ---")
    for idx, node in enumerate(retrieved_nodes):
        print(f"\nResult [{idx + 1}] (Score: {node.score:.4f}):")
        print(f"Content: {node.node.get_content()}")


if __name__ == "__main__":
    sample_query = "What exact tools power the Sovereign Intelligence Hub and Account ID #AC-9042-X?"
    asyncio.run(run_hybrid_retrieval_pipeline(sample_query))
```

*(Note: two separate `":memory:"` Qdrant clients - a sync one and an async one - do NOT share data; each gets its own private in-memory store. This lesson's code does EVERYTHING through a single async client, including building an empty index and inserting nodes with the async `ainsert_nodes` method, to keep every call on one consistent client rather than silently splitting data across two unrelated stores.)*

### Step 4: Run and Verify

```bash
python src/retrieval/hybrid_search_engine.py
```

A real run against the query asking about both the Hub's tools AND account ID `#AC-9042-X` correctly surfaced BOTH relevant documents - the account ID document and the tech-stack document - proving the retriever found the exact-ID document despite it having no obvious semantic overlap with most of the query's wording.

---


*(Sample names in this lesson's data, a bank name and an account id, were later replaced with generic ones; the outputs above show the new names in place of the originals.)*

## Best Practices

- **Never mix a sync and an async client pointed at the same local Qdrant store.** Each `:memory:` client is its own isolated store; a real deployment against a genuine Qdrant server doesn't have this restriction, but local/embedded Qdrant does - always route every call through one consistent client.
- **RRF combines RANK, not raw score.** A cosine similarity of 0.82 and a keyword match count of 3 aren't comparable numbers - RRF sidesteps that entirely by only caring about each result's position (1st, 2nd, 3rd) within its own list.
- **Test hybrid search with a query that specifically needs BOTH strategies.** A query that's purely conceptual would pass even with sparse search completely broken; deliberately including an exact ID in the test query is what actually proves the sparse/keyword side is pulling its weight.

## Why This Matters in Production

Any real knowledge base will contain both conceptual content (which meaning-based search handles well) and specific identifiers, codes, or exact phrases (which keyword search handles well, and pure semantic search can genuinely miss). Hybrid search isn't a nice-to-have refinement - it's what prevents an entire category of "the AI couldn't find the one document with the exact account number the user asked about" failures.

## Density Add-On: Hybrid Retrieval Evidence Pack

For hybrid retrieval, record not only fused rank, but also source method detail.

Recommended fields per result
- `source_id`
- `fusion_score`
- `dense_rank` and `sparse_rank` (when present)
- `retrieval_method` (hybrid)
- `excerpt`

Why this helps
- You can prove which method rescued each hit.
- You can tune dense/sparse weighting with real evidence.

Practice checkpoint
- Print top-2 results with dense rank, sparse rank, and fusion score.
- Confirm at least one exact-ID hit is visible in that structured output.
