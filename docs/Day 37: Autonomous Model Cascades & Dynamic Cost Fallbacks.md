Day 37 stops sending every task to the most expensive model available, by classifying complexity first and only escalating to a frontier model when the task actually needs it.

---

## Cost & Performance Optimization — Day 37: Autonomous Model Cascades & Dynamic Cost Fallbacks

### The Problem We're Solving

Sending every single task to a frontier reasoning model (GPT-4o, Claude Opus) is simple to build but wastes real money and real latency on tasks that don't need it - extracting an email address from text doesn't require the same model as designing a distributed consensus protocol. A model cascade fixes this: a fast, cheap classifier inspects the task first, routes simple work to a cheap model, and only escalates to the expensive model when the task is genuinely complex - or when the cheap model's own attempt fails.

Focus: a lightweight classifier that routes between a cheap Tier 1 model and a frontier Tier 2 model, with automatic escalation on Tier 1 failure
Time investment: 15 minutes

### Step 1: Build the Cascade

`apps/ai-engine/src/optimization/model_cascade.py` wires three agents: a `router_agent` (gpt-4o-mini) that only classifies complexity, `tier1_agent` (gpt-4o-mini) for simple tasks, and `tier2_agent` (gpt-4o) for complex tasks or Tier 1 failures:

```python
if decision.complexity == TaskComplexity.LOW:
    try:
        res = await tier1_agent.run(user_query)
        final_text = str(res.output)
    except Exception as err:
        print(f" [TIER 1 FAILURE] {err}. Escalating to Tier 2 frontier...")
        res = await tier2_agent.run(user_query)
        final_text = str(res.output)
        tier_name = "Tier 2 (gpt-4o - Escalated)"
else:
    res = await tier2_agent.run(user_query)
    tier_name = "Tier 2 (gpt-4o - Direct)"
```

### Step 2: Run and Verify - the Router's Own Decisions, Not Just the Final Answer

```
Analyzing Query: 'Extract the email from: 'Contact our support team at support@example.com for details.''
 [ROUTER] Complexity: LOW | Reason: Extracting an email from a simple text is a straightforward task that requires basic text processing.
 [DISPATCH] Executing on low-cost Tier 1 model...
Result 1 (Tier 1 (gpt-4o-mini), 11073.98ms):
The email extracted is: support@example.com.

Analyzing Query: 'Architect a Byzantine fault-tolerant consensus protocol for multi-region Redis sync.'
 [ROUTER] Complexity: HIGH | Reason: This task involves designing a Byzantine fault-tolerant consensus protocol, which requires understanding distributed systems, fault tolerance mechanisms, and multi-region data synchronization complexities...
 [DISPATCH] High complexity detected. Routing directly to Tier 2 frontier...
Result 2 (Tier 2 (gpt-4o - Direct), 11994.84ms):
Creating a Byzantine fault-tolerant (BFT) consensus protocol for synchronizing Redis across multiple regions is a comple...
```

Real, correct routing decisions: the router genuinely classified the email-extraction task as LOW and the consensus-protocol task as HIGH, and each routed to the correct tier - not hardcoded, actually decided by the classifier agent reading each query.

---

## Best Practices

- **Verify the router's OWN classification and stated reasoning, not just that the final answer looks reasonable.** A cascade that always escalates to Tier 2 regardless of the router's decision would produce equally good-looking final answers while defeating the entire cost-saving purpose - only checking the router's actual verdict proves the routing logic is doing real work.
- **Catch a Tier 1 failure and escalate, rather than letting the whole request fail.** A cheap model occasionally failing validation or erroring out shouldn't sacrifice the whole request when a more capable model is available as a fallback - the escalation path is what makes the cost optimization safe to rely on in production, not just in the happy path.
- **The classifier itself should be the CHEAPEST model in the cascade, not a third expensive call.** Using `gpt-4o-mini` for the router (rather than gpt-4o) means the "should we spend more?" decision itself doesn't undermine the savings it's trying to create.

## Why This Matters in Production

A cascade isn't just a cost optimization - it's also a latency optimization, since a small model genuinely responds faster for tasks within its competence. Verifying that the router's classification actually drives which tier handles the request (not just checking that answers come back correct either way) is what proves the savings are real rather than assumed.
