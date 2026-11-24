import asyncio

import networkx as nx
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class EntityRelationTriplet(BaseModel):
    subject: str = Field(description="The source entity (e.g., 'Pydantic AI').")
    predicate: str = Field(description="The relationship link (e.g., 'PROVIDES_TYPE_SAFETY_FOR').")
    object: str = Field(description="The target entity (e.g., 'Sovereign Intelligence Hub').")


class ExtractedKnowledgeGraph(BaseModel):
    triplets: list[EntityRelationTriplet]


class GraphQueryAnswer(BaseModel):
    relational_path: list[str] = Field(description="The graph traversal path used.")
    final_answer: str = Field(description="The synthesized relational answer.")


# Unlike Day 4/14's vector search, which finds text that reads as similar
# in MEANING, a knowledge graph stores EXPLICIT relationships extracted as
# (Subject -> Predicate -> Object) triplets - the right tool for a
# multi-hop question like "what depends on X and was affected by Y",
# which a similarity search alone can't reliably answer.
graph_extractor_agent = Agent(
    "openai:gpt-4o",
    output_type=ExtractedKnowledgeGraph,
    system_prompt=(
        "We are a knowledge graph architect. "
        "Extract explicit entities and relationships as (Subject -> Predicate -> Object) triplets."
    ),
)

graph_reasoner_agent = Agent(
    "openai:gpt-4o",
    output_type=GraphQueryAnswer,
    system_prompt="We reason over Knowledge Graph triplets to answer complex multi-hop engineering questions.",
)


class LocalKnowledgeGraph:
    """A local, in-memory relational graph using NetworkX's DiGraph (directed graph)."""

    def __init__(self) -> None:
        self.graph = nx.DiGraph()

    def add_triplets(self, triplets: list[EntityRelationTriplet]) -> None:
        for t in triplets:
            sub = t.subject.lower().strip()
            obj = t.object.lower().strip()
            pred = t.predicate.upper().strip()
            self.graph.add_edge(sub, obj, relation=pred)

    def get_subgraph_context(self, entity: str) -> str:
        entity = entity.lower().strip()
        if not self.graph.has_node(entity):
            return "No relational graph context found."

        edges = self.graph.edges(entity, data=True)
        context_lines = [f"({src}) --[{data['relation']}]--> ({tgt})" for src, tgt, data in edges]
        return "\n".join(context_lines)


async def run_graph_rag_pipeline(text_corpus: str, query_entity: str) -> GraphQueryAnswer:
    print("Step 1: Extracting Knowledge Graph Triplets from text corpus...")

    extraction_res = await graph_extractor_agent.run(f"Extract graph triplets from: {text_corpus}")
    extracted_data: ExtractedKnowledgeGraph = extraction_res.output

    print("\n--- Extracted Relational Triplets ---")
    kg = LocalKnowledgeGraph()
    kg.add_triplets(extracted_data.triplets)

    for t in extracted_data.triplets:
        print(f" ({t.subject}) --[{t.predicate}]--> ({t.object})")

    print(f"\nStep 2: Traversing Knowledge Graph for query entity: '{query_entity}'...")
    graph_context = kg.get_subgraph_context(query_entity)
    print(f"Graph Context Retrieved:\n{graph_context}")

    print("\nStep 3: Synthesizing multi-hop graph answer...")
    synthesis_prompt = f"Graph Triplet Context:\n{graph_context}\n\nAnswer query for entity: {query_entity}"
    reasoning_res = await graph_reasoner_agent.run(synthesis_prompt)
    answer_data: GraphQueryAnswer = reasoning_res.output

    return answer_data


if __name__ == "__main__":
    sample_text = (
        "The Sovereign Intelligence Hub is built by Byron. "
        "The Sovereign Intelligence Hub uses Pydantic AI for type safety. "
        "Pydantic AI enforces strict output validation with Logfire observability."
    )

    result = asyncio.run(run_graph_rag_pipeline(sample_text, query_entity="Sovereign Intelligence Hub"))

    print("\n--- Final Graph RAG Synthesis ---")
    print(f"Traversal Path: {result.relational_path}")
    print(f"Synthesized Answer: {result.final_answer}")
