Day 25's TypeScript port is where this repo found a real, critical security problem in the obvious library choice - and chose not to ship it.

---

## CI/CD Evals — Day 25 (TS Port): Automated Regression Testing in CI/CD

### The Problem We're Solving

A CI/CD quality gate runs an automated eval check on every push and pull request, so a prompt change or model swap that quietly drops answer quality gets blocked from merging. For the TypeScript side, the obvious first choice - DeepEval's own official TypeScript SDK - turned out to carry a real security cost.

Focus: a real security finding that changed which library actually got used, and a hand-rolled equivalent that avoided the risk
Time investment: 15 minutes, plus a genuine security detour

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the quality judge (`GEval(name="Enterprise Architecture Quality", criteria=...)` from DeepEval) | the quality judge (a hand-rolled `generateObject` judge call with `gpt-4o` in `ci-eval-gate.ts`, scoring 0.0-1.0 against the same criterion) |
| the pass bar (`threshold=0.5`) | the pass bar (the same 0.5 threshold) |
| failing the build on a regression (`assert_test(...)` inside pytest) | failing the build on a regression (a non-zero process exit code) |
| running the gate (`python -m pytest tests/test_ci_eval_gates.py -v`) | running the gate (`npm run ci-eval-gate`) |
| the CI job in `.github/workflows/ai-eval-gate.yml` (`run-evals-python`) | the CI job in `.github/workflows/ai-eval-gate.yml` (`run-evals-ts`) |

### Step 1: A Real Security Finding - Why This Doesn't Use DeepEval's TypeScript SDK

DeepEval shipped an official TypeScript SDK in 2026 (`npm install deepeval`), which looked like the obvious direct equivalent for a TS port. Installing it revealed a genuine problem: `npm audit` after the install showed the dependency count jump from 2 known issues (moderate/high, unrelated pre-existing findings) to **15**, including **1 CRITICAL** finding - a transitive `protobufjs` dependency with multiple real CVEs (arbitrary code execution, prototype pollution, several denial-of-service vectors), pulled in by the SDK's OpenTelemetry tracing integration, a feature this repo doesn't even use.

This is the same class of decision this repo already made on Day 13 (declining `guardrails-ai` for a different reason) - a library's headline feature doesn't automatically justify its full dependency weight, especially when a critical vulnerability rides in through a part of the package that isn't actually needed.

**Decision: don't ship the critical-vulnerability package into a portfolio repo.** The install was reverted (`git checkout -- package.json package-lock.json`), confirmed back to baseline (`1 high, 1 moderate` - the pre-existing, unrelated findings), and the TS port was hand-rolled instead using the same LLM-as-a-judge pattern already proven working on Day 19's `agent-evaluator.ts`.

### Step 2: The Hand-Rolled TS Regression Gate

`apps/web/src/evals/ci-eval-gate.ts` runs the same two-case benchmark dataset through a `generateObject` judge call (Vercel AI SDK, `gpt-4o`), scoring each case 0.0-1.0 against the same "technically accurate, grounded, no vague filler" criterion, and exits with a non-zero process code if any case falls below the 0.5 threshold - the same fail-the-build behavior as `assert_test` in pytest, without a test-runner framework dependency (this app has no Vitest/Jest configured).

```bash
npm run ci-eval-gate
```

Real run: both benchmark cases scored **0.90**, judge reasons genuinely explaining why (specific, accurate, grounded in the reference context) - `Regression gate PASSED`.

### Step 3: Wire Both Languages Into the Same Workflow

`.github/workflows/ai-eval-gate.yml` runs two parallel jobs - `run-evals-python` and `run-evals-ts` - each independently gated behind the `OPENAI_API_KEY` secret, so either language's regression gate blocks a merge on its own.

---

## Best Practices

- **`npm audit` before AND after adding a new dependency, especially an eval/observability SDK that brings its own tracing stack.** The critical finding here rode in through a feature (OTel tracing) this repo doesn't use at all - a headline feature's dependency weight is not free just because you're not calling it.
- **When a "which library" decision surfaces a real security concern, document the actual audit numbers, not a vague "it seemed risky."** The before/after vulnerability counts (2 → 15, including 1 critical) are the actual evidence backing this decision.

## Why This Matters in Production

A security scan on a new eval dependency matters exactly as much as one on production application code - an eval library only runs in CI and dev, but a critical RCE-class vulnerability in `node_modules` is a real supply-chain risk regardless of which pipeline stage it lives in. The right response to "the obvious library choice is risky" is to build the smaller equivalent, not to accept the risk because the alternative feels like more work.

## Density Add-On: Family-Level CI Signals

This TS gate should evolve from one score to four family signals.

1. Retrieval eval signal
2. Answer eval signal
3. Tool-use eval signal
4. Trace eval signal

Why this helps: one failing family can be fixed faster than debugging one blended score.

Practice checkpoint
- Add a family label to each test case.
- Print threshold, score, and reason grouped by family.

Common mistake box
- Mistake: failing CI with a generic "regression" message.
- Fix: include family name and first failed case in CI output.
