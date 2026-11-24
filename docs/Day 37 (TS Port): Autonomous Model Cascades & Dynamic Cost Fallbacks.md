Day 37's TypeScript port builds the same cost-aware cascade using the Vercel AI SDK's `generateText`/`generateObject`, and captures a real, much clearer latency gap between tiers than the Python run happened to show.

---

## Cost & Performance Optimization — Day 37 (TS Port): Autonomous Model Cascades & Dynamic Cost Fallbacks

### The Problem We're Solving

Same problem as the Python lesson: sending every task to the most expensive model wastes money and latency on work a cheaper model can handle. A cascade classifies complexity first, then routes.

Focus: the same cheap-classifier-then-route pipeline, built with `generateObject` for classification and `generateText` for the actual work
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the routing classifier's output shape (`class RoutingDecision(BaseModel)`) | the routing classifier's output shape (`const RoutingDecisionSchema = z.object({...})`) |
| running the classifier (`await router_agent.run(...)`) | running the classifier (`await generateObject({ model, schema, prompt })`) |
| the cheap tier (`tier1_agent = Agent("openai:gpt-4o-mini", ...)`) | the cheap tier (`runTier1()` calling `generateText({ model: openai("gpt-4o-mini") })`) |
| the frontier tier (`tier2_agent = Agent("openai:gpt-4o", ...)`) | the frontier tier (`runTier2()` calling `generateText({ model: openai("gpt-4o") })`) |
| catching a Tier 1 failure and escalating (`try/except` around `tier1_agent.run`) | catching a Tier 1 failure and escalating (`try/catch` around `runTier1()`) |

### Step 1: Build the Cascade

```typescript
if (decision.complexity === "LOW") {
  try {
    finalText = await runTier1(userQuery);
  } catch (error) {
    console.log(` [TIER 1 FAILURE] ${(error as Error).message}. Escalating to Tier 2 frontier...`);
    finalText = await runTier2(userQuery);
    tierUsed = "Tier 2 (gpt-4o - Escalated)";
  }
} else {
  finalText = await runTier2(userQuery);
  tierUsed = "Tier 2 (gpt-4o - Direct)";
}
```

### Step 2: Run and Verify - a Much Clearer Real Latency Gap Than the Python Run

```
Analyzing Query: 'Extract the email from: 'Contact our support team at support@example.com for details.''
 [ROUTER] Complexity: LOW | Reason: The task involves a simple extraction of an email address from a given text...
 [DISPATCH] Executing on low-cost Tier 1 model...
Result 1 (Tier 1 (gpt-4o-mini), 2726ms):
The extracted email is: support@example.com.

Analyzing Query: 'Architect a Byzantine fault-tolerant consensus protocol for multi-region Redis sync.'
 [ROUTER] Complexity: HIGH | Reason: Designing a Byzantine fault-tolerant consensus protocol involves complex multi-node communication...
 [DISPATCH] High complexity detected. Routing directly to Tier 2 frontier...
Result 2 (Tier 2 (gpt-4o - Direct), 16255ms):
Byzantine fault-tolerant (BFT) consensus protocols are designed to handle arbitrary faults within a distributed system,...

Latency comparison: LOW=2726ms vs HIGH=16255ms
```

This run's latency gap (2.7s vs 16.3s, roughly 6x) is a much clearer real demonstration of the cascade's actual value than the Python run happened to show (both landed near 11-12s that particular run) - a genuine reminder that model API latency has real run-to-run variance, and a single measurement of "the savings" should be treated as a sample, not a guaranteed ratio. `tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **Don't treat a single latency measurement as the definitive "savings number" for a cascade.** This lesson's own two runs (Python: ~11s vs ~12s; TS: ~2.7s vs ~16s) show real variance in how pronounced the Tier 1 vs Tier 2 gap looks from one run to the next - model API response time depends on factors outside the code's control (load, response length, network). Report a range or repeat measurements rather than quoting one run as gospel.
- **Keep the classifier call and the actual work call as two genuinely separate model invocations, never one call trying to do both.** Asking a single model call to both classify complexity AND produce the final answer would prevent ever routing the classification step itself to the cheapest possible model - the entire savings mechanism depends on that separation.

## Why This Port Matters in Production

The identical cascade logic holds across both languages, but the real timing evidence differs meaningfully between runs and between languages, purely from live API variance - a reminder that "how much does routing actually save" is an empirical question worth re-measuring under real production load, not a fixed constant you can assume from one lucky run in a lesson.
