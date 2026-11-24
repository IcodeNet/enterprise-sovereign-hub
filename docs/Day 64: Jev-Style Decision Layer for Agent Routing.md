Day 64 adds a decision-first routing pattern inspired by Jev/System One style models: typed choice output + confidence gating before the rest of the agent pipeline runs.

This lesson uses an in-repo deterministic approximation (keyword-weighted scoring + threshold gate) so behavior is fully runnable offline. It does not call an external Jev API.

---

## Resilience & Safety — Day 64: Jev-Style Decision Layer for Agent Routing

### The Problem We're Solving

Our baseline Eunomia routing path can classify intent with keyword or LLM JSON output, but both patterns have a weakness:

- keyword routing can misroute mixed-intent prompts,
- JSON generation requires parsing and gives no explicit abstain contract by default.

For high-risk intents (for example simulation or portfolio), a forced misroute is worse than a deliberate escalation.

This day introduces a typed decision pattern:

- score all intent options,
- pick one typed intent,
- attach explicit confidence score,
- escalate to `unknown` when confidence is below threshold.

Focus: reduce risky misroutes by adding confidence-aware routing
Time investment: 15 minutes

### How the code works (before you run it)

This lesson is easiest to understand as a 4-stage pipeline.

1) Baseline route (`baseline_keyword_classifier`)

- A simple keyword matcher picks one intent.
- It never abstains and always returns a hard decision.

2) Raw Jev-style decision (`jev_style_raw_decision`)

- The code builds a score map for every typed intent.
- Matching keywords add weight to one or more intents.
- Scores are normalized into a confidence-like value.

Key lines:

```python
scores = {
    Intent.BALANCE: 0.01,
    Intent.COVERAGE: 0.01,
    Intent.PRODUCTS: 0.01,
    Intent.FAQ: 0.01,
    Intent.SIMULATION: 0.01,
    Intent.PORTFOLIO: 0.01,
    Intent.UNKNOWN: 0.01,
}

total = sum(scores.values())
probabilities = {intent: score / total for intent, score in scores.items()}
top_intent, top_confidence = max(probabilities.items(), key=lambda item: item[1])
```

3) Confidence gate (`route_with_jev_confidence`)

- If top intent confidence is below threshold, route escalates to `unknown`.
- This is the key safety behavior for mixed high-risk prompts.

Key lines:

```python
def route_with_jev_confidence(message: str, min_confidence: float = 0.45) -> RoutedDecision:
    raw = jev_style_raw_decision(message)
    if raw.confidence < min_confidence and raw.intent != Intent.UNKNOWN:
        return RoutedDecision(intent=Intent.UNKNOWN, confidence=raw.confidence, escalated=True)
    return RoutedDecision(intent=raw.intent, confidence=raw.confidence, escalated=False)
```

4) Evaluation (`evaluate_baseline` vs `evaluate_jev_style`)

- Both routers run on the same fixed case list.
- We compare accuracy, high-risk misroutes, and escalations.
- The pass criteria are explicit assertions in `main()`.

Key lines:

```python
assert jev.high_risk_misroutes <= baseline.high_risk_misroutes
assert jev.accuracy >= baseline.accuracy
assert jev.escalations >= 1
```

What to look for in output:

- At least one `escalated=true` case (confidence gate exercised).
- Fewer or equal high-risk misroutes versus baseline.
- Accuracy that does not regress.

### Why this lesson uses `in`/contains checks instead of regex

We intentionally used simple substring checks for the teaching version:

- easier to read for first-time readers,
- deterministic behavior with fewer moving parts,
- clearer mapping from keyword -> score change when debugging.

Regex is useful when matching patterns (for example amounts, account masks, or multi-word forms), but it adds complexity and can hide routing intent in pattern syntax. For this lesson, we optimize for clarity first.

Substring matching is a readability choice, not a correctness advantage over regex: both are deterministic. It can match inside unrelated words (for example, `"balance"` matches `"balanced"`, and `"rate"` matches `"corporate"`). Whole-word regex can prevent some false matches, but neither method understands negation or intent. The benchmark is a teaching example, not proof of production routing quality.

### If you later switch this to a real Jev API

Keep the same control shape and replace only the raw decision source:

1) send `state + typed questions` to Jev,
2) map Jev answer to your fixed intent union,
3) keep your local confidence gate (`if confidence < threshold => unknown`),
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

### Step 1: Create the Python lesson file

No new dependency was needed for this lesson.

Create:

`apps/ai-engine/src/agents/jev_paradigm_eval.py`

The script compares two classifiers on the same benchmark set:

1) baseline keyword intent routing,
2) Jev-style decision routing with confidence gating.

### Step 2: Run and Verify — Real Output

Command:

`python apps/ai-engine/src/agents/jev_paradigm_eval.py`

Output:

```text
--- Day 64: Jev-style decision layer evaluation ---
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

Additional checks run:

- `python -m py_compile apps/ai-engine/src/agents/jev_paradigm_eval.py` -> pass
- `cd apps/ai-engine && ruff check .` -> could not run in this environment (`ruff: command not found`)

### Step 3: Evaluate Before/After on Eunomia eval corpus

To check whether this helps the existing Eunomia benchmark set (not just the synthetic Day 64 set), this day also added a comparison run (`pnpm eval:jev-compare`) to the capstone, whose implementation is not part of this repository.

Output:

```json
{
  "comparedCases": 7,
  "before": {
    "label": "eunomia_rule_classifier",
    "total": 7,
    "correct": 7,
    "accuracy": 1,
    "highRiskMisroutes": 0,
    "escalations": 0
  },
  "after": {
    "label": "jev_style_decision_layer",
    "total": 7,
    "correct": 7,
    "accuracy": 1,
    "highRiskMisroutes": 0,
    "escalations": 0
  },
  "delta": {
    "accuracy": 0,
    "highRiskMisroutes": 0,
    "escalations": 0
  }
}
```

Interpretation:

- On the current Eunomia baseline set, rule routing is already perfect.
- The Jev-style layer shows parity (no gain, no regression) on those 7 cases.
- The synthetic stress case still demonstrates why abstention can be safer for mixed high-risk prompts.

## Best Practices

- Keep intent options typed and finite.
- Treat confidence as a control signal, not just telemetry.
- Count escalation only when threshold gating changes a non-unknown decision to `unknown`.
- Evaluate on both synthetic stress cases and real Eunomia eval corpus.

## Why This Matters in Production

This pattern gives Eunomia a clean separation:

- decision layer decides route with explicit confidence,
- policy layer enforces what that route is allowed to do,
- generation layer writes user-facing text after route and policy are fixed.

That separation makes routing behavior easier to test, audit, and evolve without hidden prompt-parsing fragility.

## Complete runnable Python source (verified in this run)

```python
"""Day 64: Jev-style decision layer evaluation for Eunomia-style routing.

This is a deterministic in-repo approximation of a Jev-style decision layer.
It demonstrates typed routing + confidence gating mechanics. It does not call
an external Jev/System One API, and its confidence values are normalized
heuristic scores (not calibrated probabilities).
"""

from dataclasses import dataclass
from enum import Enum


class Intent(str, Enum):
    BALANCE = "balance"
    COVERAGE = "coverage"
    PRODUCTS = "products"
    FAQ = "faq"
    SIMULATION = "simulation"
    PORTFOLIO = "portfolio"
    UNKNOWN = "unknown"


class RiskTier(str, Enum):
    LOW = "low"
    HIGH = "high"


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    message: str
    expected_intent: Intent
    risk_tier: RiskTier


@dataclass(frozen=True)
class Decision:
    intent: Intent
    confidence: float


@dataclass(frozen=True)
class RoutedDecision:
    intent: Intent
    confidence: float
    escalated: bool


@dataclass(frozen=True)
class EvalSummary:
    label: str
    total: int
    correct: int
    accuracy: float
    high_risk_misroutes: int
    escalations: int


CASES: tuple[EvalCase, ...] = (
    EvalCase("c01", "what is my balance", Intent.BALANCE, RiskTier.LOW),
    EvalCase("c02", "am i fully covered by fscs", Intent.COVERAGE, RiskTier.LOW),
    EvalCase("c03", "show me savings products and rates", Intent.PRODUCTS, RiskTier.LOW),
    EvalCase("c04", "what does notice period mean", Intent.FAQ, RiskTier.LOW),
    EvalCase("c05", "run a what-if projection simulation", Intent.SIMULATION, RiskTier.HIGH),
    EvalCase("c06", "i consent, optimise my portfolio as balanced", Intent.PORTFOLIO, RiskTier.HIGH),
    EvalCase("c07", "is my account safe and fully covered", Intent.COVERAGE, RiskTier.LOW),
    EvalCase("c08", "help me compare isa products", Intent.PRODUCTS, RiskTier.LOW),
    EvalCase("c09", "simulate and optimise my savings plan", Intent.SIMULATION, RiskTier.HIGH),
    EvalCase("c10", "tell me mortgage refinance options", Intent.UNKNOWN, RiskTier.HIGH),
    EvalCase(
        "c11",
        "please simulate, optimise, compare rates, and check coverage",
        Intent.UNKNOWN,
        RiskTier.HIGH,
    ),
)


def baseline_keyword_classifier(message: str) -> Intent:
    text = message.lower()
    if "balance" in text or "account" in text:
        return Intent.BALANCE
    if "cover" in text or "safe" in text or "fscs" in text or "coverage" in text:
        return Intent.COVERAGE
    if "product" in text or "rate" in text or "compare" in text or "isa" in text:
        return Intent.PRODUCTS
    if "faq" in text or "notice" in text or "withdraw" in text:
        return Intent.FAQ
    if "simulate" in text or "simulation" in text or "projection" in text or "what-if" in text:
        return Intent.SIMULATION
    if "portfolio" in text or "optimise" in text or "optimize" in text:
        return Intent.PORTFOLIO
    return Intent.UNKNOWN


def jev_style_raw_decision(message: str) -> Decision:
    text = message.lower()
    scores = {
        Intent.BALANCE: 0.01,
        Intent.COVERAGE: 0.01,
        Intent.PRODUCTS: 0.01,
        Intent.FAQ: 0.01,
        Intent.SIMULATION: 0.01,
        Intent.PORTFOLIO: 0.01,
        Intent.UNKNOWN: 0.01,
    }

    if "balance" in text or "account" in text:
        scores[Intent.BALANCE] += 0.80
    if "cover" in text or "safe" in text or "fscs" in text or "coverage" in text:
        scores[Intent.COVERAGE] += 0.85
    if "product" in text or "rate" in text or "compare" in text or "isa" in text:
        scores[Intent.PRODUCTS] += 0.80
    if "faq" in text or "notice" in text or "withdraw" in text:
        scores[Intent.FAQ] += 0.75
    if "simulate" in text or "simulation" in text or "projection" in text or "what-if" in text:
        scores[Intent.SIMULATION] += 0.95
    if "portfolio" in text or "optimise" in text or "optimize" in text:
        scores[Intent.PORTFOLIO] += 0.95

    if max(scores.values()) <= 0.20:
        scores[Intent.UNKNOWN] += 0.80

    total = sum(scores.values())
    probabilities = {intent: score / total for intent, score in scores.items()}
    top_intent, top_confidence = max(probabilities.items(), key=lambda item: item[1])
    return Decision(intent=top_intent, confidence=top_confidence)


def route_with_jev_confidence(message: str, min_confidence: float = 0.45) -> RoutedDecision:
    raw = jev_style_raw_decision(message)
    if raw.confidence < min_confidence and raw.intent != Intent.UNKNOWN:
        return RoutedDecision(intent=Intent.UNKNOWN, confidence=raw.confidence, escalated=True)
    return RoutedDecision(intent=raw.intent, confidence=raw.confidence, escalated=False)


def route_with_baseline(message: str) -> RoutedDecision:
    return RoutedDecision(intent=baseline_keyword_classifier(message), confidence=1.0, escalated=False)


def evaluate_baseline(cases: tuple[EvalCase, ...]) -> EvalSummary:
    total = len(cases)
    correct = 0
    high_risk_misroutes = 0
    escalations = 0

    for case in cases:
        predicted = route_with_baseline(case.message)
        if predicted.escalated:
            escalations += 1
        if predicted.intent == case.expected_intent:
            correct += 1
        elif case.risk_tier == RiskTier.HIGH and predicted.intent != Intent.UNKNOWN:
            high_risk_misroutes += 1

    return EvalSummary(
        label="baseline_keyword",
        total=total,
        correct=correct,
        accuracy=correct / total,
        high_risk_misroutes=high_risk_misroutes,
        escalations=escalations,
    )


def evaluate_jev_style(cases: tuple[EvalCase, ...], min_confidence: float) -> EvalSummary:
    total = len(cases)
    correct = 0
    high_risk_misroutes = 0
    escalations = 0

    for case in cases:
        decision = route_with_jev_confidence(case.message, min_confidence=min_confidence)
        if decision.escalated:
            escalations += 1
        if decision.intent == case.expected_intent:
            correct += 1
        elif case.risk_tier == RiskTier.HIGH and decision.intent != Intent.UNKNOWN:
            high_risk_misroutes += 1

    return EvalSummary(
        label=f"jev_style(min_confidence={min_confidence:.2f})",
        total=total,
        correct=correct,
        accuracy=correct / total,
        high_risk_misroutes=high_risk_misroutes,
        escalations=escalations,
    )


def main() -> None:
    print("--- Day 64: Jev-style decision layer evaluation ---")
    threshold = 0.45
    baseline = evaluate_baseline(CASES)
    jev = evaluate_jev_style(CASES, min_confidence=threshold)

    print(
        "Baseline: "
        f"accuracy={baseline.accuracy:.2f}, "
        f"high_risk_misroutes={baseline.high_risk_misroutes}, "
        f"escalations={baseline.escalations}"
    )
    print(
        "Jev-style: "
        f"accuracy={jev.accuracy:.2f}, "
        f"high_risk_misroutes={jev.high_risk_misroutes}, "
        f"escalations={jev.escalations}"
    )

    print("\nCase-level comparison:")
    for case in CASES:
        b = route_with_baseline(case.message)
        j = route_with_jev_confidence(case.message, min_confidence=threshold)
        print(
            f"{case.case_id} expected={case.expected_intent.value:<10} "
            f"baseline={b.intent.value:<10} "
            f"jev={j.intent.value:<10} "
            f"confidence={j.confidence:.2f} "
            f"escalated={str(j.escalated).lower()}"
        )

    assert jev.high_risk_misroutes <= baseline.high_risk_misroutes
    assert jev.accuracy >= baseline.accuracy
    assert jev.escalations >= 1
    print("\n[VERIFIED] Jev-style routing reduced or matched high-risk misroutes.")
    print("[VERIFIED] Jev-style routing matched or improved accuracy on this benchmark.")
    print("[VERIFIED] Confidence gate was exercised by at least one low-confidence mixed-intent case.")


if __name__ == "__main__":
    main()
```
