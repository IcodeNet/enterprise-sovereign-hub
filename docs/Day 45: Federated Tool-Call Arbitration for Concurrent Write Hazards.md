Day 45 lets an LLM sequence concurrent, conflicting tool calls into a safe execution order - and adds a programmatic check that verifies the plan against its own stated rules, rather than trusting the model's plausible-sounding rationale alone.

---

## Multi-Agent Orchestration — Day 45: Federated Tool-Call Arbitration for Concurrent Write Hazards

### The Problem We're Solving

Independent specialist agents (a scraper writing data, a cache-invalidation agent, a dashboard reading data) often propose tool calls against the SAME shared resource at nearly the same time. If those calls execute in arbitrary order, a stale cache read, a write-after-read hazard, or corrupted data can result. A federated arbitrator evaluates the pending proposals as a batch and returns one safe, ordered execution plan before any of them actually run.

Focus: an arbitrator agent that sequences 3 conflicting proposals on the same resource into a safe order, with the plan's correctness checked programmatically afterward
Time investment: 15 minutes

### Step 1: Build the Arbitrator

`apps/ai-engine/src/agents/federated_arbitrator.py` gives the arbitrator agent 3 explicit rules and 3 concurrent proposals (an INVALIDATE, a WRITE, and a READ, all targeting `market_trends`):

```python
arbitrator_agent = Agent(
    "openai:gpt-4o",
    output_type=ArbitrationPlan,
    system_prompt=(
        "Rules: 1. WRITE or DELETE operations lock target resources. "
        "2. READ actions must not run concurrently with WRITE actions on the same resource. "
        "3. Cache INVALIDATE actions must execute strictly AFTER the corresponding WRITE commits."
    ),
)
```

### Step 2: Don't Just Trust the Model's Rationale - Check the Plan Against Its Own Stated Rules

The source's own demo prints the model's plan and rationale and stops there - a plausible-sounding rationale isn't the same as a genuinely rule-compliant plan. Added a real programmatic check: for every INVALIDATE action, confirm its corresponding WRITE/DELETE on the same resource is scheduled strictly earlier in the plan.

```python
def validate_plan_against_rules(proposals, plan) -> list[str]:
    for inv_id in invalidate_actions:
        matching_writes = [w for w in write_actions if by_agent[w].target_resource == inv_resource]
        for write_id in matching_writes:
            if plan.execution_order.index(inv_id) < plan.execution_order.index(write_id):
                violations.append(f"INVALIDATE '{inv_id}' scheduled before its WRITE '{write_id}' - violates rule 3.")
```

### Step 3: Run and Verify

```
Execution Order: scraper_worker_agent -> cache_manager_agent -> dashboard_query_agent
Rejected Actions: None
Rationale: 1. The WRITE operation by 'scraper_worker_agent' locks the 'market_trends' resource...
2. The INVALIDATE operation by 'cache_manager_agent' must occur strictly after the WRITE operation...
3. The READ operation by 'dashboard_query_agent' must wait until both the WRITE and the subsequent
INVALIDATE actions are complete...

[PLAN VALIDATION PASSED] Execution order genuinely respects the stated dependency rules.
```

Real, programmatically-confirmed result: WRITE genuinely comes before INVALIDATE, which comes before READ - not just a plausible-sounding explanation, but a plan that actually passes a rule check written independently of the model's own reasoning.

---

## Best Practices

- **Never trust an LLM's own natural-language rationale as proof its output actually follows the rules it was given.** The rationale text sounds correct regardless of whether the underlying `execution_order` list actually is - only a programmatic check against the real rule (INVALIDATE index > WRITE index) can catch a plan whose plan doesn't match its own stated reasoning.
- **Write the validation rule independently of the prompt that generated the plan.** The check function doesn't call the model or reuse its rationale text - it re-derives the rule (WRITE must precede its matching INVALIDATE) from first principles and checks the plan against it, which is what makes it a genuine, independent verification rather than a restatement of what the model already claimed.
- **This kind of arbitration works well for a SMALL, explicit set of concurrent proposals evaluated as one batch - it's not a substitute for a real distributed lock at scale.** For 3 proposals in one prompt, an LLM-based arbitrator is a reasonable pattern; for hundreds of concurrent operations across a live system, this doesn't replace a real transactional/locking mechanism.

## Why This Matters in Production

An arbitration plan that "sounds right" and an arbitration plan that IS right are different claims, and only the second one actually prevents the race condition this pattern exists to solve. Verifying the plan's correctness with an independent rule check - not just reading the model's own explanation - is what turns "the AI said this order is safe" into "we confirmed this order is safe."
