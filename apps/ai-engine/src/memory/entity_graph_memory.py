"""Dynamic entity-graph memory with relationship resolution - Day 34.

Rather than storing memory as flat text, extract entities and relationships
from each new statement, then merge them into one persistent graph so
related facts accumulate and reinforce each other over multiple sessions.
"""

import asyncio

import networkx as nx
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class DiscoveredRelation(BaseModel):
    source_entity: str = Field(description="Canonical source entity name.")
    target_entity: str = Field(description="Canonical target entity name.")
    relationship: str = Field(description="Action or link between entities.")
    confidence: float = Field(default=1.0, description="Confidence weight between 0.0 and 1.0.")


class EntityExtractionPayload(BaseModel):
    entities: list[str] = Field(description="Unique entities identified in text.")
    relations: list[DiscoveredRelation] = Field(description="Extracted relational links.")


graph_memory_agent = Agent(
    "openai:gpt-4o",
    output_type=EntityExtractionPayload,
    system_prompt=(
        "We are a principal knowledge graph architect. "
        "Extract entities and relationships from input statements. "
        "Always normalize entity names into clean, canonical titles (e.g. 'Byron' instead of 'me')."
    ),
)


class DynamicEntityGraph:
    def __init__(self):
        self.graph = nx.DiGraph()

    def update_graph(self, payload: EntityExtractionPayload) -> None:
        for node in payload.entities:
            canonical_node = node.strip().title()
            if not self.graph.has_node(canonical_node):
                self.graph.add_node(canonical_node, mentions=1)
            else:
                self.graph.nodes[canonical_node]["mentions"] += 1

        for rel in payload.relations:
            src = rel.source_entity.strip().title()
            tgt = rel.target_entity.strip().title()

            # If relation already exists, increment edge weight; otherwise add new edge.
            if self.graph.has_edge(src, tgt):
                self.graph[src][tgt]["weight"] += rel.confidence
                self.graph[src][tgt]["relation"] = rel.relationship
            else:
                self.graph.add_edge(src, tgt, relation=rel.relationship, weight=rel.confidence)

    def query_entity_neighborhood(self, entity_name: str) -> list[str]:
        canonical = entity_name.strip().title()
        if not self.graph.has_node(canonical):
            return [f"No graph knowledge found for entity '{canonical}'."]

        insights = []
        for _, target, data in self.graph.out_edges(canonical, data=True):
            insights.append(f"({canonical}) -[{data['relation']}]-> ({target}) [weight: {data['weight']:.1f}]")
        for source, _, data in self.graph.in_edges(canonical, data=True):
            insights.append(f"({source}) -[{data['relation']}]-> ({canonical}) [weight: {data['weight']:.1f}]")
        return insights


async def process_and_link_fact(graph: DynamicEntityGraph, new_information: str) -> None:
    print(f'\nProcessing Statement: "{new_information}"')
    result = await graph_memory_agent.run(new_information)
    data: EntityExtractionPayload = result.output

    graph.update_graph(data)
    print(f"Extracted Entities: {data.entities}")
    for rel in data.relations:
        print(f" -> Link: ({rel.source_entity}) -[{rel.relationship}]-> ({rel.target_entity})")


async def main() -> None:
    memory_graph = DynamicEntityGraph()

    await process_and_link_fact(
        memory_graph,
        "Byron leads AI Engineering architecture at a fintech company and designs sovereign agent frameworks.",
    )

    await process_and_link_fact(
        memory_graph,
        "The sovereign agent frameworks run on cloud container infrastructure with a type-safe agent library.",
    )

    print("\n=== Graph Memory Query for 'Byron' ===")
    connections = memory_graph.query_entity_neighborhood("Byron")
    for conn in connections:
        print(f" {conn}")


if __name__ == "__main__":
    asyncio.run(main())
