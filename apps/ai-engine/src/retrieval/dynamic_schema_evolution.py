"""Autonomous knowledge-graph ontology evolution with triplet validation - Day 41.

A fixed knowledge-graph ontology rejects or misfits any new relationship
type it wasn't designed for. This lesson evaluates each extracted triplet
against the current allowed predicates, and when a genuinely new
relationship is found, a schema evaluator agent decides whether to
approve and register it - or reject it as redundant.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class ProposedRelation(BaseModel):
    subject: str
    proposed_predicate: str = Field(description="Uppercase relationship string, e.g. DEPLOYS_TO.")
    object: str
    is_new_predicate: bool


class SchemaEvolutionProposal(BaseModel):
    predicate_name: str
    description: str
    is_approved: bool = Field(description="True if predicate passes naming and domain standards.")
    rejection_reason: str | None = None


class DynamicOntologyRegistry:
    def __init__(self):
        self.allowed_predicates: set[str] = {
            "USES_FRAMEWORK",
            "HOSTED_ON",
            "DEPENDS_ON",
            "AUTHORED_BY",
        }

    def register_predicate(self, predicate: str, rationale: str) -> None:
        normalized = predicate.strip().upper().replace(" ", "_")
        self.allowed_predicates.add(normalized)
        print(f" [ONTOLOGY UPDATED] Added '{normalized}' to active schema: {rationale}")


extractor_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=ProposedRelation,
    system_prompt="We extract subject-predicate-object triplets from technical engineering text.",
)

schema_evaluator_agent = Agent(
    "openai:gpt-4o",
    output_type=SchemaEvolutionProposal,
    system_prompt=(
        "We are an ontology architect. Inspect proposed relationship predicates. "
        "Reject redundant predicates (e.g. 'RUNS_INSIDE' if 'HOSTED_ON' exists). "
        "Approve distinct, useful technical relationships formatted in UPPER_SNAKE_CASE."
    ),
)


async def process_and_evolve_schema(raw_text: str, registry: DynamicOntologyRegistry) -> None:
    print(f'\nProcessing Statement: "{raw_text}"')

    res = await extractor_agent.run(
        f"Known predicates: {list(registry.allowed_predicates)}\n\nExtract triplet from: {raw_text}"
    )
    candidate: ProposedRelation = res.output
    candidate_pred = candidate.proposed_predicate.strip().upper().replace(" ", "_")

    print(f"Candidate Triplet: ({candidate.subject}) -[{candidate_pred}]-> ({candidate.object})")

    if candidate_pred in registry.allowed_predicates:
        print(f" [ACCEPTED] Predicate '{candidate_pred}' is recognized in current schema.")
        return

    print(f" [UNKNOWN PREDICATE] '{candidate_pred}' not found in ontology. Evaluating schema evolution...")
    eval_prompt = (
        f"Known Predicates: {list(registry.allowed_predicates)}\n"
        f"Proposed Predicate: {candidate_pred}\n"
        f"Context: {raw_text}"
    )
    eval_res = await schema_evaluator_agent.run(eval_prompt)
    decision: SchemaEvolutionProposal = eval_res.output

    if decision.is_approved:
        registry.register_predicate(decision.predicate_name, decision.description)
        print(f" [SUCCESS] Triplet committed with evolved predicate: '{decision.predicate_name}'.")
    else:
        print(f" [REJECTED] Predicate rejected by ontology guard. Reason: {decision.rejection_reason}")


async def main() -> None:
    ontology = DynamicOntologyRegistry()

    # Test 1: Fits existing schema (USES_FRAMEWORK).
    await process_and_evolve_schema(
        "The Sovereign Hub uses Pydantic AI for structured outputs.",
        ontology,
    )

    # Test 2: Introduces a distinct relationship needing evolution.
    await process_and_evolve_schema(
        "The security fuzzer dynamically penetrates the target API boundary.",
        ontology,
    )

    # Test 3: A near-duplicate of an existing predicate - should be
    # rejected as redundant against DEPENDS_ON, proving the evaluator
    # doesn't just rubber-stamp every proposal.
    await process_and_evolve_schema(
        "The web app relies on the AI engine service to function.",
        ontology,
    )

    print(f"\nFinal Ontology: {sorted(ontology.allowed_predicates)}")


if __name__ == "__main__":
    asyncio.run(main())
