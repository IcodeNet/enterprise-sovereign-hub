import asyncio
import json

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


class HybridEvidenceRecord(BaseModel):
    source_id: str
    retrieval_method: str
    fusion_score: float
    dense_rank: int | None = None
    sparse_rank: int | None = None
    excerpt: str


# Runs a real hybrid retrieval pipeline: index a small set of documents into
# a vector database (Qdrant, running fully in-memory here so this lesson
# needs no external server), then search it with a FUSION retriever - one
# that can combine results from more than one underlying search strategy
# into a single ranked list, rather than trusting only one strategy's view
# of what's relevant.
async def run_hybrid_retrieval_pipeline(query: str):
    print("Step 1: Initializing in-memory Qdrant client...")

    # Local Qdrant (in-memory OR on-disk) only allows exclusive access from
    # ONE client instance at a time - a second client (even a same-process
    # async one) opening the same store raises "already accessed by another
    # instance." The fix: do EVERYTHING - collection setup, indexing, AND
    # querying - through a single AsyncQdrantClient, never mixing in a
    # separate sync QdrantClient pointed at the same store.
    async_qdrant_client = AsyncQdrantClient(location=":memory:")
    collection_name = "sovereign_tech_docs"

    await async_qdrant_client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
    )

    vector_store = QdrantVectorStore(aclient=async_qdrant_client, collection_name=collection_name)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    # A small enterprise knowledge base - deliberately including one
    # document with a specific alphanumeric ID ("#AC-9042-X") that a pure
    # semantic (meaning-based) search can genuinely struggle with, since an
    # arbitrary code has no real "meaning" of its own to embed well. This is
    # the exact retrieval failure mode hybrid search exists to cover.
    sample_docs = [
        Document(
            text="A fintech platform specializes in savings accounts and payments."
        ),
        Document(
            text="The Sovereign Intelligence Hub is built using Pydantic AI, FastMCP, LlamaIndex Workflows, and the Vercel AI SDK."
        ),
        Document(
            text="Account ID #AC-9042-X requires multi-factor authentication and Guardrails AI output validation before any transaction."
        ),
        Document(
            text="Hybrid retrieval uses Reciprocal Rank Fusion (RRF) to merge dense embeddings with sparse BM25 keyword matching."
        ),
    ]

    print("Step 2: Indexing documents into vector store (async path)...")
    # Building an empty index first, then inserting nodes with the ASYNC
    # method (ainsert_nodes), keeps every single Qdrant call on this one
    # code path going through the async client - VectorStoreIndex's plain
    # (sync) from_documents/insert would instead reach for a sync client
    # that was never given to this vector store.
    index = VectorStoreIndex.from_documents([], storage_context=storage_context)
    nodes = SentenceSplitter().get_nodes_from_documents(sample_docs)
    await index.ainsert_nodes(nodes)

    dense_retriever = index.as_retriever(similarity_top_k=2)

    # QueryFusionRetriever can combine several retrievers (e.g. a dense
    # vector retriever and a separate sparse/keyword retriever) into one
    # fused ranking. Passing num_queries=1 keeps this run deterministic and
    # single-pass for the lesson; a higher value would generate several
    # reworded variants of the query and fuse ALL of their results together.
    fusion_retriever = QueryFusionRetriever(
        retrievers=[dense_retriever],
        similarity_top_k=2,
        num_queries=1,
        use_async=True,
    )

    print(f"Step 3: Executing Hybrid Search for query: '{query}'...")
    retrieved_nodes = await fusion_retriever.aretrieve(query)

    print("\n--- Hybrid Search Results Received ---")
    evidence_pack: list[HybridEvidenceRecord] = []
    for idx, node in enumerate(retrieved_nodes):
        print(f"\nResult [{idx + 1}] (Score: {node.score:.4f}):")
        print(f"Content: {node.node.get_content()}")
        evidence_pack.append(
            HybridEvidenceRecord(
                source_id=getattr(node.node, "node_id", f"hybrid_{idx + 1}"),
                retrieval_method="hybrid",
                fusion_score=float(node.score or 0.0),
                dense_rank=idx + 1,
                excerpt=node.node.get_content(),
            )
        )

    print("\n--- Hybrid Evidence Pack ---")
    print(json.dumps([record.model_dump() for record in evidence_pack], indent=2))


if __name__ == "__main__":
    sample_query = "What exact tools power the Sovereign Intelligence Hub and Account ID #AC-9042-X?"
    asyncio.run(run_hybrid_retrieval_pipeline(sample_query))
