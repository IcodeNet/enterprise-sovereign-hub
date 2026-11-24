TypeScript port of Day 64 with the same decision-first routing pattern: typed intent choice + confidence gating + before/after evaluation.

This lesson uses an in-repo deterministic approximation (keyword-weighted scoring + threshold gate), not a live Jev API call.

What it's called in Python | What it's called in TypeScript
--- | ---
`Decision(intent, confidence)` dataclass | `Decision` interface
`route_with_jev_confidence(...)` | `routeWithJevConfidence(...)`
`EvalSummary` dataclass | `EvalSummary` interface

---

## Resilience & Safety — Day 64 (TS Port): Jev-Style Decision Layer for Agent Routing

### The Problem We're Solving

TypeScript Eunomia flows face the same routing issues as Python flows:

- keyword-first routing can misclassify mixed-intent messages,
- generated-JSON classifiers still need parse/validation and may hide uncertainty.

This lesson applies the same typed decision pattern in TS and verifies it with real run output.

Focus: confidence-aware routing for safer intent decisions
Time investment: 15 minutes

### How the TypeScript code works (before you run it)

Use this mental model while reading `apps/web/src/agents/jev-paradigm-eval.ts`.

1) Baseline route (`baselineKeywordClassifier`)

- A deterministic keyword matcher returns one typed intent.
- No abstain path, so mixed prompts can be forced into the wrong class.

2) Raw Jev-style decision (`jevStyleRawDecision`)

- Every intent starts with a small prior score.
- Matched keywords add weighted evidence.
- The scores are normalized and sorted to get the top intent + confidence.

Key lines:

```typescript
const scores: Record<Intent, number> = {
  balance: 0.01,
  coverage: 0.01,
  products: 0.01,
  faq: 0.01,
  simulation: 0.01,
  portfolio: 0.01,
  unknown: 0.01,
};

const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
const probabilities = Object.entries(scores).map(([intent, score]) => ({
  intent: intent as Intent,
  probability: score / total,
}));
probabilities.sort((a, b) => b.probability - a.probability);
```

3) Confidence gate (`routeWithJevConfidence`)

- If confidence is below threshold, non-unknown intent is escalated to `unknown`.
- This is where risk-aware abstention is enforced.

Key lines:

```typescript
function routeWithJevConfidence(message: string, minConfidence = 0.45): RoutedDecision {
  const raw = jevStyleRawDecision(message);
  if (raw.confidence < minConfidence && raw.intent !== "unknown") {
    return { intent: "unknown", confidence: raw.confidence, escalated: true };
  }
  return { intent: raw.intent, confidence: raw.confidence, escalated: false };
}
```

4) Before/after assertions in `main()`

- The script fails non-zero when safety/quality constraints are violated.
- This makes it CI-friendly for promotion gates.

Key lines:

```typescript
if (jev.highRiskMisroutes > baseline.highRiskMisroutes) {
  throw new Error("Expected Jev-style routing to reduce or match high-risk misroutes");
}
if (jev.accuracy < baseline.accuracy) {
  throw new Error("Expected Jev-style routing to match or improve accuracy");
}
if (jev.escalations < 1) {
  throw new Error("Expected confidence gate to trigger at least one escalation");
}
```

What to look for in output:

- at least one `escalated=true` decision,
- fewer or equal high-risk misroutes,
- no accuracy regression.

### Why this lesson uses `includes()` checks instead of regex

We intentionally use `includes()` in the teaching version because:

- the matching logic is easy to read line by line,
- each keyword-to-score rule is explicit and debuggable,
- behavior is deterministic without regex edge cases.

Regex can be better for richer pattern matching (for example account number masks or amount formats), but it makes the routing logic harder to read for a first pass.

Substring matching is a readability choice, not a correctness advantage over regex: both are deterministic. It can match inside unrelated words (for example, `"balance"` matches `"balanced"`, and `"rate"` matches `"corporate"`). Whole-word regex can prevent some false matches, but neither method understands negation or intent. The benchmark is a teaching example, not proof of production routing quality.

### If you later switch this to a real Jev API

Keep the same control flow and swap only the raw decision source:

1) send `state + typed questions` to Jev,
2) map Jev's returned choice to your `Intent` union,
3) keep local confidence gating (`confidence < threshold => unknown`),
4) on timeout or invalid response, abstain to `unknown` for sensitive requests; use a local fallback only where policy explicitly permits it.

This section describes an optional integration only: no paid API calls are made by this lesson. Use the documented TypeSafe endpoint `POST https://api.typesafe.ai/v1/systemone` with server-side Bearer authentication through an approved gateway. Read `answers.route.choice` and `answers.route.confidence`; validate both before routing. Jev confidence is not the same as our largest normalized keyword score, so re-evaluate the threshold rather than copying 0.45. On failure, abstain to `unknown` for sensitive requests rather than trusting the weak keyword fallback. Policy and tool authorization remain separate deterministic checks. API reference: https://docs.typesafe.ai/api ; confidence: https://docs.typesafe.ai/confidence .

Minimal request shape:

```json
{
  "model": "jev-latest",
  "state": "user message + relevant policy context",
  "questions": {
    "route": {
      "type": "choice",
      "instructions": "Choose the safest best-fit intent.",
      "criteria": {
        "balance": "Balance and account amount questions",
        "coverage": "FSCS and safety coverage questions",
        "products": "Product/rate comparison questions",
        "faq": "General policy/term questions",
        "simulation": "What-if projection requests",
        "portfolio": "Portfolio optimisation requests",
        "unknown": "Ambiguous or mixed intent; needs escalation"
      }
    }
  }
}
```

### Step 1: Create the TypeScript lesson file

No new npm package was required.

Create:

`apps/web/src/agents/jev-paradigm-eval.ts`

The script runs the same benchmark shape as Python and enforces three checks:

- Jev-style high-risk misroutes must not increase,
- Jev-style accuracy must not drop,
- confidence gating must be exercised at least once.

### Step 2: Run and Verify — Real Output

Command:

`cd apps/web && npx tsx src/agents/jev-paradigm-eval.ts`

Output:

```text
--- Day 64 (TS): Jev-style decision layer evaluation ---
Baseline: accuracy=0.73, high_risk_misroutes=2, escalations=0
Jev-style: accuracy=1.00, high_risk_misroutes=0, escalations=1

Case-level comparison:
c01 expected=balance    baseline=balance    jev=balance    confidence=0.93 escalated=false
c02 expected=coverage   baseline=coverage   jev=coverage   confidence=0.93 escalated=false
c03 expected=products   baseline=products   jev=products   confidence=0.93 escalated=false
c04 expected=faq        baseline=faq        jev=faq        confidence=0.93 escalated=false
c05 expected=simulation baseline=simulation jev=simulation confidence=0.94 escalated=false
c06 expected=portfolio  baseline=balance    jev=portfolio  confidence=0.53 escalated=false
c07 expected=coverage   baseline=balance    jev=coverage   confidence=0.50 escalated=false
c08 expected=products   baseline=products   jev=products   confidence=0.93 escalated=false
c09 expected=simulation baseline=simulation jev=simulation confidence=0.49 escalated=false
c10 expected=unknown    baseline=unknown    jev=unknown    confidence=0.93 escalated=false
c11 expected=unknown    baseline=coverage   jev=unknown    confidence=0.27 escalated=true

[VERIFIED] Jev-style routing reduced or matched high-risk misroutes.
[VERIFIED] Jev-style routing matched or improved accuracy on this benchmark.
[VERIFIED] Confidence gate was exercised by at least one low-confidence mixed-intent case.
```

Checks run:

- `cd apps/web && npx tsc --noEmit` -> pass
- `cd apps/web && npx oxlint src/agents/jev-paradigm-eval.ts` -> pass
- `cd apps/web && npx oxfmt --check src/agents/jev-paradigm-eval.ts` -> pass

### Step 3: Verify the Eunomia eval comparison command

This day also added a reusable comparison run to the capstone (`pnpm eval:jev-compare`; the capstone's implementation is not part of this repository). It compares current Eunomia rule routing and Jev-style decision routing on the Eunomia eval-case corpus.

Observed result in this run:

- accuracy unchanged (1.00 -> 1.00),
- high-risk misroutes unchanged (0 -> 0),
- escalations unchanged (0 -> 0).

So this pattern currently shows parity on the existing Eunomia baseline set.

## Best Practices

- Keep confidence threshold explicit in code, not buried in prompt text.
- Count escalation only when threshold gating changes a non-unknown decision to `unknown`.
- Keep TS and Python benchmark sets aligned so cross-language claims stay testable.

## Why This Matters in Production

For Eunomia, this gives a practical path to adopt Jev-style routing safely:

- start as a side-by-side measured layer,
- keep policy and tool authority unchanged,
- promote only when eval corpus shows real gain (or equivalent accuracy with lower risk) on real Eunomia cases.

## Complete runnable TypeScript source (verified in this run)

```typescript
/**
 * Day 64 (TS Port): Jev-style decision layer evaluation for Eunomia-style routing.
 *
 * This is a deterministic in-repo approximation of a Jev-style decision layer.
 * It demonstrates typed routing + confidence gating mechanics.
 * It does not call an external Jev/System One API.
 */

type Intent = "balance" | "coverage" | "products" | "faq" | "simulation" | "portfolio" | "unknown";

type RiskTier = "low" | "high";

interface EvalCase {
  caseId: string;
  message: string;
  expectedIntent: Intent;
  riskTier: RiskTier;
}

interface Decision {
  intent: Intent;
  confidence: number;
}

interface RoutedDecision {
  intent: Intent;
  confidence: number;
  escalated: boolean;
}

interface EvalSummary {
  label: string;
  total: number;
  correct: number;
  accuracy: number;
  highRiskMisroutes: number;
  escalations: number;
}

const CASES: EvalCase[] = [
  { caseId: "c01", message: "what is my balance", expectedIntent: "balance", riskTier: "low" },
  {
    caseId: "c02",
    message: "am i fully covered by fscs",
    expectedIntent: "coverage",
    riskTier: "low",
  },
  {
    caseId: "c03",
    message: "show me savings products and rates",
    expectedIntent: "products",
    riskTier: "low",
  },
  {
    caseId: "c04",
    message: "what does notice period mean",
    expectedIntent: "faq",
    riskTier: "low",
  },
  {
    caseId: "c05",
    message: "run a what-if projection simulation",
    expectedIntent: "simulation",
    riskTier: "high",
  },
  {
    caseId: "c06",
    message: "i consent, optimise my portfolio as balanced",
    expectedIntent: "portfolio",
    riskTier: "high",
  },
  {
    caseId: "c07",
    message: "is my account safe and fully covered",
    expectedIntent: "coverage",
    riskTier: "low",
  },
  {
    caseId: "c08",
    message: "help me compare isa products",
    expectedIntent: "products",
    riskTier: "low",
  },
  {
    caseId: "c09",
    message: "simulate and optimise my savings plan",
    expectedIntent: "simulation",
    riskTier: "high",
  },
  {
    caseId: "c10",
    message: "tell me mortgage refinance options",
    expectedIntent: "unknown",
    riskTier: "high",
  },
  {
    caseId: "c11",
    message: "please simulate, optimise, compare rates, and check coverage",
    expectedIntent: "unknown",
    riskTier: "high",
  },
];

function baselineKeywordClassifier(message: string): Intent {
  const text = message.toLowerCase();
  if (text.includes("balance") || text.includes("account")) return "balance";
  if (
    text.includes("cover") ||
    text.includes("safe") ||
    text.includes("fscs") ||
    text.includes("coverage")
  )
    return "coverage";
  if (
    text.includes("product") ||
    text.includes("rate") ||
    text.includes("compare") ||
    text.includes("isa")
  ) {
    return "products";
  }
  if (text.includes("faq") || text.includes("notice") || text.includes("withdraw")) return "faq";
  if (
    text.includes("simulate") ||
    text.includes("simulation") ||
    text.includes("projection") ||
    text.includes("what-if")
  ) {
    return "simulation";
  }
  if (text.includes("portfolio") || text.includes("optimise") || text.includes("optimize"))
    return "portfolio";
  return "unknown";
}

function jevStyleRawDecision(message: string): Decision {
  const text = message.toLowerCase();
  const scores: Record<Intent, number> = {
    balance: 0.01,
    coverage: 0.01,
    products: 0.01,
    faq: 0.01,
    simulation: 0.01,
    portfolio: 0.01,
    unknown: 0.01,
  };

  if (text.includes("balance") || text.includes("account")) scores.balance += 0.8;
  if (
    text.includes("cover") ||
    text.includes("safe") ||
    text.includes("fscs") ||
    text.includes("coverage")
  )
    scores.coverage += 0.85;
  if (
    text.includes("product") ||
    text.includes("rate") ||
    text.includes("compare") ||
    text.includes("isa")
  ) {
    scores.products += 0.8;
  }
  if (text.includes("faq") || text.includes("notice") || text.includes("withdraw"))
    scores.faq += 0.75;
  if (
    text.includes("simulate") ||
    text.includes("simulation") ||
    text.includes("projection") ||
    text.includes("what-if")
  ) {
    scores.simulation += 0.95;
  }
  if (text.includes("portfolio") || text.includes("optimise") || text.includes("optimize")) {
    scores.portfolio += 0.95;
  }

  if (Math.max(...Object.values(scores)) <= 0.2) {
    scores.unknown += 0.8;
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const probabilities = Object.entries(scores).map(([intent, score]) => ({
    intent: intent as Intent,
    probability: score / total,
  }));
  probabilities.sort((a, b) => b.probability - a.probability);

  return {
    intent: probabilities[0]?.intent ?? "unknown",
    confidence: probabilities[0]?.probability ?? 0,
  };
}

function routeWithJevConfidence(message: string, minConfidence = 0.45): RoutedDecision {
  const raw = jevStyleRawDecision(message);
  if (raw.confidence < minConfidence && raw.intent !== "unknown") {
    return { intent: "unknown", confidence: raw.confidence, escalated: true };
  }
  return { intent: raw.intent, confidence: raw.confidence, escalated: false };
}

function routeWithBaseline(message: string): RoutedDecision {
  return { intent: baselineKeywordClassifier(message), confidence: 1, escalated: false };
}

function evaluateBaseline(cases: EvalCase[]): EvalSummary {
  let correct = 0;
  let highRiskMisroutes = 0;
  let escalations = 0;

  for (const c of cases) {
    const predicted = routeWithBaseline(c.message);
    if (predicted.escalated) escalations += 1;
    if (predicted.intent === c.expectedIntent) {
      correct += 1;
    } else if (c.riskTier === "high" && predicted.intent !== "unknown") {
      highRiskMisroutes += 1;
    }
  }

  return {
    label: "baseline_keyword",
    total: cases.length,
    correct,
    accuracy: correct / cases.length,
    highRiskMisroutes,
    escalations,
  };
}

function evaluateJevStyle(cases: EvalCase[], minConfidence: number): EvalSummary {
  let correct = 0;
  let highRiskMisroutes = 0;
  let escalations = 0;

  for (const c of cases) {
    const decision = routeWithJevConfidence(c.message, minConfidence);
    if (decision.escalated) escalations += 1;
    if (decision.intent === c.expectedIntent) {
      correct += 1;
    } else if (c.riskTier === "high" && decision.intent !== "unknown") {
      highRiskMisroutes += 1;
    }
  }

  return {
    label: `jev_style(min_confidence=${minConfidence.toFixed(2)})`,
    total: cases.length,
    correct,
    accuracy: correct / cases.length,
    highRiskMisroutes,
    escalations,
  };
}

async function main(): Promise<void> {
  console.log("--- Day 64 (TS): Jev-style decision layer evaluation ---");

  const threshold = 0.45;
  const baseline = evaluateBaseline(CASES);
  const jev = evaluateJevStyle(CASES, threshold);

  console.log(
    `Baseline: accuracy=${baseline.accuracy.toFixed(2)}, high_risk_misroutes=${baseline.highRiskMisroutes}, escalations=${baseline.escalations}`,
  );
  console.log(
    `Jev-style: accuracy=${jev.accuracy.toFixed(2)}, high_risk_misroutes=${jev.highRiskMisroutes}, escalations=${jev.escalations}`,
  );

  console.log("\nCase-level comparison:");
  for (const c of CASES) {
    const baselineDecision = routeWithBaseline(c.message);
    const jevDecision = routeWithJevConfidence(c.message, threshold);
    console.log(
      `${c.caseId} expected=${c.expectedIntent.padEnd(10)} baseline=${baselineDecision.intent.padEnd(10)} jev=${jevDecision.intent.padEnd(10)} confidence=${jevDecision.confidence.toFixed(2)} escalated=${String(jevDecision.escalated)}`,
    );
  }

  if (jev.highRiskMisroutes > baseline.highRiskMisroutes) {
    throw new Error("Expected Jev-style routing to reduce or match high-risk misroutes");
  }
  if (jev.accuracy < baseline.accuracy) {
    throw new Error("Expected Jev-style routing to match or improve accuracy");
  }
  if (jev.escalations < 1) {
    throw new Error("Expected confidence gate to trigger at least one escalation");
  }

  console.log("\n[VERIFIED] Jev-style routing reduced or matched high-risk misroutes.");
  console.log("[VERIFIED] Jev-style routing matched or improved accuracy on this benchmark.");
  console.log(
    "[VERIFIED] Confidence gate was exercised by at least one low-confidence mixed-intent case.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```
