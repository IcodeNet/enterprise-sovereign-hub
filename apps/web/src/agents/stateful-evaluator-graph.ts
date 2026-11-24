/**
 * Stateful evaluator graph with explicit terminal states - Day 59 TS port.
 */

type EvalState = "draft" | "evaluating" | "needs_revision" | "approved" | "rejected";

interface EvalContext {
  attempt: number;
  maxAttempts: number;
  score: number;
  threshold: number;
  state: EvalState;
}

function step(context: EvalContext): EvalContext {
  if (context.state === "draft") {
    return { ...context, state: "evaluating" };
  }

  if (context.state === "evaluating") {
    if (context.score >= context.threshold) {
      return { ...context, state: "approved" };
    }

    if (context.attempt >= context.maxAttempts) {
      return { ...context, state: "rejected" };
    }

    return { ...context, attempt: context.attempt + 1, state: "needs_revision" };
  }

  if (context.state === "needs_revision") {
    return { ...context, state: "draft" };
  }

  return context;
}

function runGraph(scores: number[], threshold: number, maxAttempts: number): EvalContext {
  let index = 0;
  let context: EvalContext = {
    attempt: 1,
    maxAttempts,
    score: scores[0],
    threshold,
    state: "draft",
  };

  while (!(context.state === "approved" || context.state === "rejected")) {
    context = step(context);
    if (context.state === "draft" && index + 1 < scores.length) {
      index += 1;
      context = { ...context, score: scores[index] };
    }
  }

  return context;
}

async function main(): Promise<void> {
  console.log("--- Test 1: First attempt clears threshold -> approved ---");
  let out = runGraph([0.92], 0.9, 3);
  console.log(`Terminal: ${out.state}, attempts=${out.attempt}, score=${out.score}`);
  if (!(out.state === "approved" && out.attempt === 1)) {
    throw new Error("Expected immediate approval");
  }
  console.log("[VERIFIED] Graph approved immediately when score met threshold.");

  console.log("\n--- Test 2: Revision path then approval on second attempt ---");
  out = runGraph([0.74, 0.91], 0.9, 3);
  console.log(`Terminal: ${out.state}, attempts=${out.attempt}, score=${out.score}`);
  if (!(out.state === "approved" && out.attempt === 2)) {
    throw new Error("Expected approval after one revision cycle");
  }
  console.log("[VERIFIED] Graph moved through NEEDS_REVISION and approved after retry.");

  console.log("\n--- Test 3: Exhaust attempts -> rejected ---");
  out = runGraph([0.5, 0.62, 0.7], 0.9, 3);
  console.log(`Terminal: ${out.state}, attempts=${out.attempt}, score=${out.score}`);
  if (!(out.state === "rejected" && out.attempt === 3)) {
    throw new Error("Expected rejection at attempt cap");
  }
  console.log("[VERIFIED] Graph rejected exactly at the configured attempt cap.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
