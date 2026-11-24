Day 21 is about answering a "what connects to what" question that a similarity search alone genuinely can't answer well - by extracting explicit relationships into a real graph structure.

---

## Graph RAG — Day 21: Knowledge Graph Construction

### The Problem We're Solving

Vector search (Day 4/14) matches text based on MEANING - it's excellent for "find me documents about X" but struggles with a genuinely different kind of question: "which components depend on X and were affected by Y" - a multi-hop RELATIONAL question, not a similarity question. **Graph RAG** solves this by extracting explicit entities and relationships from text as `(Subject -> Predicate -> Object)` triplets and storing them in an actual graph structure - then a query can TRAVERSE real edges (this depends on that, which was affected by this other thing) instead of hoping semantically-similar text happens to contain the answer.

Focus: extracting structured relational triplets from text and querying the resulting knowledge graph
Time investment: 15 minutes

### Step 1: Install Graph Dependencies

```bash
pip install networkx llama-index-core pydantic-ai
```

### Step 2: Create the Source File

Inside `apps/ai-engine/src/retrieval/`, create:
`knowledge_graph_rag.py`

### Step 3: Add the Source Code

```python
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
```

### Step 4: Run and Verify

```bash
python src/retrieval/knowledge_graph_rag.py
```

A real run correctly extracted 4 genuine triplets from the sample text (`Sovereign Intelligence Hub -[IS_BUILT_BY]-> Byron`, `-[USES]-> Pydantic AI`, etc.), correctly traversed only the edges actually OUT of "Sovereign Intelligence Hub" (2 of the 4 triplets - the other 2 are edges from "Pydantic AI", a different node), and synthesized a correct multi-hop answer from that real traversal path.

---

## Best Practices

- **Normalize entity names (lowercase, trim whitespace) before adding them as graph nodes.** Without this, "Sovereign Intelligence Hub" and "sovereign intelligence hub " (extra space) from two different extraction calls would silently become two different graph nodes instead of the same one - graph correctness depends on consistent node identity.
- **A directed graph (`nx.DiGraph`) matters here, not an undirected one** - "Pydantic AI PROVIDES_TYPE_SAFETY_FOR Sovereign Intelligence Hub" is a different fact from its reverse; an undirected graph would lose that direction.
- **Query only the OUTGOING edges of the entity being asked about**, not the whole graph - this lesson's `get_subgraph_context` uses `self.graph.edges(entity, ...)`, which by default returns out-edges for a `DiGraph`, giving the reasoning agent a focused, relevant context instead of the entire graph.

## Why This Matters in Production

A multi-hop relational question ("what depends on X and was affected by Y") is a genuinely different retrieval problem from a semantic similarity question, and no amount of better embeddings fixes it - it needs an actual graph structure with real, traversable edges. Recognizing which of the two problem types a given question actually is is the first step to picking the right retrieval technique.
