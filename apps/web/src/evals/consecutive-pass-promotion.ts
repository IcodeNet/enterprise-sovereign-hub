/**
 * Consecutive-pass promotion windows for eval gates - Day 57 TS port.
 *
 * Day 56 solved what baseline to compare against.
 * Day 57 solves when to promote: one green run can be a lucky outlier,
 * so promotion requires a short window of consecutive passes, while each
 * run is still checked against approved baseline tolerance.
 */

interface EvalRun {
  runId: string;
  score: number;
  gatePassed: boolean;
}

interface PromotionDecision {
  promote: boolean;
  reason: string;
}

function shouldPromoteAfterWindow(
  history: EvalRun[],
  approvedBaselineScore: number,
  options: { windowSize?: number; maxRegression?: number } = {},
): PromotionDecision {
  const windowSize = options.windowSize ?? 3;
  const maxRegression = options.maxRegression ?? 0.02;

  if (history.length < windowSize) {
    return { promote: false, reason: `need ${windowSize} runs, got ${history.length}` };
  }

  const window = history.slice(-windowSize);
  const failed = window.filter((run) => !run.gatePassed).map((run) => run.runId);
  if (failed.length > 0) {
    return { promote: false, reason: `window contains gate failures: ${JSON.stringify(failed)}` };
  }

  for (const run of window) {
    const drop = approvedBaselineScore - run.score;
    if (drop - maxRegression > 1e-9) {
      return {
        promote: false,
        reason: `run ${run.runId} regressed ${drop.toFixed(3)} > allowed ${maxRegression.toFixed(3)}`,
      };
    }
  }

  return {
    promote: true,
    reason: `${windowSize} consecutive passes within regression tolerance`,
  };
}

async function main(): Promise<void> {
  console.log("--- Test 1: One Good Run Is Not Enough If the Window Is Unstable ---");
  const unstableHistory: EvalRun[] = [
    { runId: "r101", score: 0.95, gatePassed: true },
    { runId: "r102", score: 0.96, gatePassed: false },
    { runId: "r103", score: 0.95, gatePassed: true },
  ];
  let decision = shouldPromoteAfterWindow(unstableHistory, 0.96);
  console.log(`Decision: promote=${decision.promote} | reason=${decision.reason}`);
  if (decision.promote) throw new Error("BUG: unstable window should not promote.");
  console.log(
    "[VERIFIED] Promotion correctly blocked because one run in the window failed its gate.",
  );

  console.log("\n--- Test 2: Stable 3-Run Pass Window Promotes ---");
  const stableHistory: EvalRun[] = [
    { runId: "r201", score: 0.95, gatePassed: true },
    { runId: "r202", score: 0.95, gatePassed: true },
    { runId: "r203", score: 0.94, gatePassed: true },
  ];
  decision = shouldPromoteAfterWindow(stableHistory, 0.96, { windowSize: 3, maxRegression: 0.02 });
  console.log(`Decision: promote=${decision.promote} | reason=${decision.reason}`);
  if (!decision.promote) throw new Error("BUG: stable passing window should promote.");
  console.log(
    "[VERIFIED] Promotion allowed after 3 consecutive passing runs stayed within tolerance.",
  );

  console.log("\n--- Test 3: Consecutive Passes Still Block If Any Run Regresses Too Far ---");
  const regressedHistory: EvalRun[] = [
    { runId: "r301", score: 0.95, gatePassed: true },
    { runId: "r302", score: 0.93, gatePassed: true },
    { runId: "r303", score: 0.95, gatePassed: true },
  ];
  decision = shouldPromoteAfterWindow(regressedHistory, 0.96, {
    windowSize: 3,
    maxRegression: 0.02,
  });
  console.log(`Decision: promote=${decision.promote} | reason=${decision.reason}`);
  if (decision.promote)
    throw new Error("BUG: run that regresses > tolerance must block promotion.");
  console.log(
    "[VERIFIED] Promotion correctly blocked even with consecutive passes because one run regressed beyond tolerance.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
