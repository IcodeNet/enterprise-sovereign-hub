/**
 * Last-approved baseline promotion for eval gates - Day 56 TS port
 * (independently designed).
 *
 * An eval suite that only compares a new candidate against yesterday's
 * result has a real failure mode: if yesterday's run was ALSO a
 * regression that slipped through, comparing against it just re-approves
 * the same regression forever. This walks BACKWARD through recent
 * history to find the newest report that actually PASSED its own gate,
 * and compares the new candidate against THAT genuine baseline instead.
 */

interface EvalReport {
  commitSha: string;
  suiteName: string;
  passRate: number;
  gatePassed: boolean;
}

interface ComparisonResult {
  baselineCommit: string;
  baselineRate: number;
  candidateRate: number;
  dropPoints: number;
  isRegression: boolean;
}

/** Walks backward through history to find the newest report that fully passed its own gate. */
function findPromotableBaseline(history: EvalReport[], suiteName: string): EvalReport | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const report = history[i];
    if (report.suiteName === suiteName && report.gatePassed) {
      return report;
    }
  }
  return null;
}

/** Compares a candidate's pass rate against a fully passing baseline, allowing a small tolerance. */
function compareAgainstBaseline(
  candidate: EvalReport,
  baseline: EvalReport,
  tolerance = 0.02,
): ComparisonResult {
  const dropPoints = Math.round((baseline.passRate - candidate.passRate) * 100 * 100) / 100;
  const isRegression = dropPoints > tolerance * 100;
  return {
    baselineCommit: baseline.commitSha,
    baselineRate: baseline.passRate,
    candidateRate: candidate.passRate,
    dropPoints,
    isRegression,
  };
}

async function main(): Promise<void> {
  console.log("--- Test 1: Correctly Skip Past a Failing Report to Find the Real Baseline ---");
  const history: EvalReport[] = [
    { commitSha: "a1b2c3d", suiteName: "faq_eval", passRate: 0.94, gatePassed: true },
    { commitSha: "e4f5g6h", suiteName: "faq_eval", passRate: 0.71, gatePassed: false }, // a broken commit
  ];
  const candidate: EvalReport = {
    commitSha: "i7j8k9l",
    suiteName: "faq_eval",
    passRate: 0.9,
    gatePassed: true,
  };

  const baseline = findPromotableBaseline(history, "faq_eval");
  if (baseline === null)
    throw new Error("BUG: expected to find a fully passing baseline in history.");
  if (baseline.commitSha !== "a1b2c3d") {
    throw new Error(
      `BUG: expected the baseline to skip past the FAILING commit and land on the last fully passing one, but got '${baseline.commitSha}' instead.`,
    );
  }
  console.log(
    `[VERIFIED] Baseline correctly skipped the failing commit ('e4f5g6h', rate=0.71) and landed on the last fully passing one ('${baseline.commitSha}', rate=${baseline.passRate}).`,
  );

  const comparison = compareAgainstBaseline(candidate, baseline);
  console.log(`Comparison result: ${JSON.stringify(comparison)}`);
  if (!comparison.isRegression) {
    throw new Error(
      `BUG: a ${comparison.dropPoints}-point drop from a 94% baseline should be a genuine regression, but was not flagged.`,
    );
  }
  console.log(
    `[VERIFIED] The candidate (90%) vs. the genuine baseline (94%) is correctly flagged as a regression (${comparison.dropPoints} points, exceeds the 2-point tolerance).`,
  );

  console.log(
    "\n--- Test 2: Proving the Naive 'Most Recent Report' Approach Would Have Missed This ---",
  );
  const naiveBaseline = history[history.length - 1]; // the most recent report, regardless of whether its own gate passed
  const naiveComparison = compareAgainstBaseline(candidate, naiveBaseline);
  console.log(
    `Naive comparison (against the failing commit, not the real baseline): ${JSON.stringify(naiveComparison)}`,
  );
  if (naiveComparison.isRegression) {
    throw new Error("Test setup issue: expected the naive comparison to (wrongly) look fine.");
  }
  console.log(
    "[CONFIRMED THE FAILURE MODE] Comparing against the most recent report (which itself never passed its own gate) incorrectly " +
      "shows NO regression - this is exactly the silent 'approve the same bad thing forever' bug that walking backward to a " +
      "fully passing baseline prevents.",
  );

  console.log("\n--- Test 3: A Suite With No Passing History Reports That Honestly ---");
  const noBaselineHistory: EvalReport[] = [
    { commitSha: "x1y2z3", suiteName: "new_suite", passRate: 0.5, gatePassed: false },
  ];
  const missingBaseline = findPromotableBaseline(noBaselineHistory, "new_suite");
  if (missingBaseline !== null) {
    throw new Error("BUG: expected no promotable baseline for a suite with zero passing history.");
  }
  console.log(
    "[VERIFIED] A suite with zero fully passing history correctly reports no promotable baseline, rather than silently skipping the regression check.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
