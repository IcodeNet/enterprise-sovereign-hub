import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Autonomous knowledge-graph ontology evolution with triplet validation - Day 41 TS port.
 *
 * Evaluates each extracted triplet against the current allowed predicates;
 * when a genuinely new relationship is found, a schema evaluator agent
 * decides whether to approve and register it, or reject it as redundant.
 */

const ProposedRelationSchema = z.object({
  subject: z.string(),
  proposedPredicate: z.string().describe("Uppercase relationship string, e.g. DEPLOYS_TO."),
  object: z.string(),
});

const SchemaEvolutionProposalSchema = z.object({
  predicateName: z.string(),
  description: z.string(),
  isApproved: z.boolean().describe("True if predicate passes naming and domain standards."),
  rejectionReason: z.string().nullable(),
});

class DynamicOntologyRegistry {
  allowedPredicates = new Set(["USES_FRAMEWORK", "HOSTED_ON", "DEPENDS_ON", "AUTHORED_BY"]);

  registerPredicate(predicate: string, rationale: string): void {
    const normalized = predicate.trim().toUpperCase().replace(/ /g, "_");
    this.allowedPredicates.add(normalized);
    console.log(` [ONTOLOGY UPDATED] Added '${normalized}' to active schema: ${rationale}`);
  }
}

async function extractTriplet(rawText: string, knownPredicates: string[]) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: ProposedRelationSchema,
    system: "We extract subject-predicate-object triplets from technical engineering text.",
    prompt: `Known predicates: ${JSON.stringify(knownPredicates)}\n\nExtract triplet from: ${rawText}`,
  });
  return object;
}

async function evaluateSchemaEvolution(
  knownPredicates: string[],
  proposedPredicate: string,
  context: string,
) {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: SchemaEvolutionProposalSchema,
    system:
      "We are an ontology architect. Inspect proposed relationship predicates. Reject redundant predicates " +
      "(e.g. 'RUNS_INSIDE' if 'HOSTED_ON' exists). Approve distinct, useful technical relationships formatted in UPPER_SNAKE_CASE.",
    prompt: `Known Predicates: ${JSON.stringify(knownPredicates)}\nProposed Predicate: ${proposedPredicate}\nContext: ${context}`,
  });
  return object;
}

async function processAndEvolveSchema(
  rawText: string,
  registry: DynamicOntologyRegistry,
): Promise<void> {
  console.log(`\nProcessing Statement: "${rawText}"`);

  const candidate = await extractTriplet(rawText, [...registry.allowedPredicates]);
  const candidatePred = candidate.proposedPredicate.trim().toUpperCase().replace(/ /g, "_");

  console.log(
    `Candidate Triplet: (${candidate.subject}) -[${candidatePred}]-> (${candidate.object})`,
  );

  if (registry.allowedPredicates.has(candidatePred)) {
    console.log(` [ACCEPTED] Predicate '${candidatePred}' is recognized in current schema.`);
    return;
  }

  console.log(
    ` [UNKNOWN PREDICATE] '${candidatePred}' not found in ontology. Evaluating schema evolution...`,
  );
  const decision = await evaluateSchemaEvolution(
    [...registry.allowedPredicates],
    candidatePred,
    rawText,
  );

  if (decision.isApproved) {
    registry.registerPredicate(decision.predicateName, decision.description);
    console.log(
      ` [SUCCESS] Triplet committed with evolved predicate: '${decision.predicateName}'.`,
    );
  } else {
    console.log(
      ` [REJECTED] Predicate rejected by ontology guard. Reason: ${decision.rejectionReason}`,
    );
  }
}

async function main(): Promise<void> {
  const ontology = new DynamicOntologyRegistry();

  await processAndEvolveSchema(
    "The Sovereign Hub uses Pydantic AI for structured outputs.",
    ontology,
  );
  await processAndEvolveSchema(
    "The security fuzzer dynamically penetrates the target API boundary.",
    ontology,
  );
  await processAndEvolveSchema(
    "The web app relies on the AI engine service to function.",
    ontology,
  );

  console.log(`\nFinal Ontology: ${JSON.stringify([...ontology.allowedPredicates].toSorted())}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
