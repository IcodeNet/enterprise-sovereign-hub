interface MemoryWriteDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "empty_fact"
    | "contains_email"
    | "contains_phone"
    | "contains_secret"
    | "contains_account_identifier";
}

interface MemorySafetyEvalCase {
  fact: string;
  expectedAllowed: boolean;
  expectedReason: MemoryWriteDecision["reason"];
}

function evaluateMemoryWrite(fact: string): MemoryWriteDecision {
  const text = fact.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { allowed: false, reason: "empty_fact" };
  }

  // Block direct personal contact details.
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) {
    return { allowed: false, reason: "contains_email" };
  }
  if (/\+?\d[\d\s\-()]{7,}\d/.test(text)) {
    return { allowed: false, reason: "contains_phone" };
  }

  // Block secrets or credentials.
  if (["api key", "password", "secret", "private key"].some((token) => lower.includes(token))) {
    return { allowed: false, reason: "contains_secret" };
  }

  // Block full account identifiers in memory text.
  if (/\bacc-\d{4,}\b/.test(lower) || /#ac-\d{4}-[a-z]\b/.test(lower)) {
    return { allowed: false, reason: "contains_account_identifier" };
  }

  return { allowed: true, reason: "allowed" };
}

function runMemorySafetyEvals(cases: MemorySafetyEvalCase[]): number {
  const passed = cases.filter((testCase) => {
    const decision = evaluateMemoryWrite(testCase.fact);
    return (
      decision.allowed === testCase.expectedAllowed && decision.reason === testCase.expectedReason
    );
  }).length;

  return cases.length === 0 ? 0 : passed / cases.length;
}

const defaultCases: MemorySafetyEvalCase[] = [
  {
    fact: "Customer prefers monthly summary emails.",
    expectedAllowed: true,
    expectedReason: "allowed",
  },
  {
    fact: "Reach me at byron@example.com for account help.",
    expectedAllowed: false,
    expectedReason: "contains_email",
  },
  {
    fact: "My mobile is +44 7700 900123.",
    expectedAllowed: false,
    expectedReason: "contains_phone",
  },
  {
    fact: "Store this API key sk-prod-1234 in memory.",
    expectedAllowed: false,
    expectedReason: "contains_secret",
  },
  {
    fact: "Account ACC-4081 moved to another institution.",
    expectedAllowed: false,
    expectedReason: "contains_account_identifier",
  },
  {
    fact: "Prefers clear examples before technical detail.",
    expectedAllowed: true,
    expectedReason: "allowed",
  },
];

function main() {
  const accuracy = runMemorySafetyEvals(defaultCases);

  console.log("--- Memory Write Policy Safety Evals (TS) ---");
  for (const testCase of defaultCases) {
    const decision = evaluateMemoryWrite(testCase.fact);
    console.log(`fact=${JSON.stringify(testCase.fact)}`);
    console.log(
      `expected=(${testCase.expectedAllowed}, ${testCase.expectedReason}), actual=(${decision.allowed}, ${decision.reason})`,
    );
  }

  console.log(`safety_eval_accuracy=${(accuracy * 100).toFixed(2)}%`);
  if (accuracy < 1) {
    throw new Error("memory safety eval gate failed");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  evaluateMemoryWrite,
  runMemorySafetyEvals,
  type MemoryWriteDecision,
  type MemorySafetyEvalCase,
};
