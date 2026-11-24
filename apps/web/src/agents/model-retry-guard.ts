/**
 * Model retry guard with explicit failure classes - Day 58 TS port.
 */

type FailureKind = "transient" | "fatal";

interface AttemptResult {
  ok: boolean;
  failureKind?: FailureKind;
}

interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
}

function decideRetry(
  attemptNumber: number,
  maxRetries: number,
  result: AttemptResult,
): RetryDecision {
  if (result.ok) {
    return { shouldRetry: false, reason: "success" };
  }

  if (result.failureKind === "fatal") {
    return { shouldRetry: false, reason: "fatal error - stop immediately" };
  }

  if (attemptNumber > maxRetries) {
    return { shouldRetry: false, reason: `retry budget exhausted (${maxRetries})` };
  }

  return {
    shouldRetry: true,
    reason: `transient error - retry ${attemptNumber}/${maxRetries}`,
  };
}

function runWithGuard(
  scriptedResults: AttemptResult[],
  maxRetries: number,
): { recovered: boolean; attempts: number; reason: string } {
  let attempt = 1;

  for (const result of scriptedResults) {
    const decision = decideRetry(attempt, maxRetries, result);
    if (result.ok) {
      return { recovered: true, attempts: attempt, reason: "completed" };
    }
    if (!decision.shouldRetry) {
      return { recovered: false, attempts: attempt, reason: decision.reason };
    }
    attempt += 1;
  }

  return { recovered: false, attempts: attempt - 1, reason: "script ended before success" };
}

async function main(): Promise<void> {
  console.log("--- Test 1: Transient failure then success should recover within budget ---");
  let out = runWithGuard([{ ok: false, failureKind: "transient" }, { ok: true }], 2);
  console.log(`Result: recovered=${out.recovered}, attempts=${out.attempts}, reason=${out.reason}`);
  if (!(out.recovered && out.attempts === 2))
    throw new Error("Expected recovery on second attempt");
  console.log("[VERIFIED] Transient failure was retried and recovered.");

  console.log("\n--- Test 2: Fatal failure should stop immediately with no retry ---");
  out = runWithGuard([{ ok: false, failureKind: "fatal" }], 3);
  console.log(`Result: recovered=${out.recovered}, attempts=${out.attempts}, reason=${out.reason}`);
  if (!(!out.recovered && out.attempts === 1 && out.reason.includes("fatal"))) {
    throw new Error("Expected immediate stop for fatal failure");
  }
  console.log("[VERIFIED] Fatal failure correctly stopped without wasting retry budget.");

  console.log("\n--- Test 3: Repeated transient failures should stop at retry budget ---");
  out = runWithGuard(
    [
      { ok: false, failureKind: "transient" },
      { ok: false, failureKind: "transient" },
      { ok: false, failureKind: "transient" },
    ],
    2,
  );
  console.log(`Result: recovered=${out.recovered}, attempts=${out.attempts}, reason=${out.reason}`);
  if (!(!out.recovered && out.attempts === 3 && out.reason.includes("budget exhausted"))) {
    throw new Error("Expected stop at retry budget boundary");
  }
  console.log("[VERIFIED] Retry loop stopped exactly at the configured budget.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
