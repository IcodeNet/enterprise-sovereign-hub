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
