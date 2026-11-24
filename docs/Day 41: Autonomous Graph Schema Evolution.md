Day 41 finds a real, structural bug in the source design: showing an extractor agent the current ontology's own predicates biases it to always reuse an existing one, which means schema evolution never actually triggers in practice.

---

## Retrieval & Knowledge Graphs — Day 41: Autonomous Graph Schema Evolution

### The Problem We're Solving

A fixed knowledge-graph ontology (allowed entity types and relationship predicates) rejects or force-fits any genuinely new relationship type it wasn't designed for. An autonomous schema-evolution pipeline should let a genuinely novel relationship type get proposed, evaluated, and either approved into the live ontology or rejected as redundant - without corrupting historical graph relations already using the old schema.

Focus: evaluating extracted triplets against a live ontology registry, evolving the schema when a genuinely new predicate is approved
Time investment: 15 minutes

### Step 1: Build the Extractor, Registry, and Evaluator

`apps/ai-engine/src/retrieval/dynamic_schema_evolution.py` wires an `extractor_agent` (pulls a subject-predicate-object triplet from raw text) and a `schema_evaluator_agent` (only invoked if the extracted predicate isn't already in the registry):

```python
if candidate_pred in registry.allowed_predicates:
    print(f" [ACCEPTED] Predicate '{candidate_pred}' is recognized in current schema.")
    return

eval_res = await schema_evaluator_agent.run(eval_prompt)
decision: SchemaEvolutionProposal = eval_res.output
if decision.is_approved:
    registry.register_predicate(decision.predicate_name, decision.description)
```

### Step 2: A Real Structural Finding - Schema Evolution Almost Never Actually Triggers

Ran the source's own two test cases, PLUS a genuinely different third case, PLUS two more varied inputs across a follow-up test - 5 different real statements in total, deliberately chosen to describe relationships that don't obviously map onto the 4 seed predicates (`USES_FRAMEWORK`, `HOSTED_ON`, `DEPENDS_ON`, `AUTHORED_BY`):

```
"The security fuzzer dynamically penetrates the target API boundary." -> DEPENDS_ON (accepted)
"The web app relies on the AI engine service to function."             -> DEPENDS_ON (accepted)
"The compliance auditor cryptographically signs the deployment..."     -> AUTHORED_BY (accepted)
"The incident postmortem was co-authored with the on-call rotation..." -> AUTHORED_BY (accepted)
"The feature flag rollback superseded the previous canary deployment"  -> DEPENDS_ON (accepted)
```

**Real root cause found**: `extractor_agent`'s own prompt explicitly shows it the current `registry.allowed_predicates` list (`f"Known predicates: {list(registry.allowed_predicates)}"`) before asking it to extract a triplet - which biases the model to normalize almost any relationship into one of the predicates it was just shown, rather than genuinely proposing something new. "Penetrates" became `DEPENDS_ON`. "Co-authored" became `AUTHORED_BY`. Schema evolution was designed to trigger on a genuinely unknown predicate, but showing the extractor the known list ahead of time makes that almost never happen in practice - not a crash, not an error, just a design choice that quietly defeats its own stated purpose across every real test run.

### Step 3: Verify the Evaluator's Own Logic Directly, Since the Pipeline Never Naturally Triggered It

```python
# Genuinely novel predicate:
Approved: True | Predicate: CRYPTOGRAPHICALLY_SIGNS

# Genuinely redundant predicate:
Approved: False | Rejection Reason: The predicate 'RUNS_INSIDE' is redundant with the existing
predicate 'HOSTED_ON', which can describe relationships between entities and hosting environments...
```

Real, correct behavior when actually exercised directly: the evaluator genuinely approves a distinct new relationship and genuinely rejects a redundant one - the evaluation LOGIC works fine, it's just never reached by the full pipeline because of Step 2's finding.

---

## Best Practices

- **Showing a model the "known options" list before asking it to classify or extract can bias it toward reusing those options, even when a genuinely different answer would be more accurate.** This is a real, subtle prompt-design trap: it feels helpful (give the model context on what already exists) but can quietly suppress the exact behavior (proposing something new) the pipeline exists to enable.
- **A test suite that never actually exercises the "interesting" branch of a pipeline (schema evolution, in this case) should say so plainly, and verify that branch's logic directly instead of leaving it unverified.** 5 real test cases, 0 evolution events - that's the actual, honest result, not a lesson-writing failure to find better examples.
- **When you need a specific branch to trigger for a demo, either fix the design bias causing it not to trigger, or test the branch directly and document why the design choice suppresses it in practice.** This lesson does the latter - the fix (not showing the extractor the known predicate list) would be the "right fix" but changes the pipeline's actual behavior in a way worth a deliberate decision, not a quick patch.

## Why This Matters in Production

A pipeline's OWN prompt design can quietly defeat its own stated purpose without ever throwing an error - the code runs, returns plausible-looking results, and nothing looks broken, but the specific capability (schema evolution) it was built to demonstrate never actually fires. Only running enough varied real test cases, and then directly verifying the unreached logic branch, surfaces this kind of structural finding.
