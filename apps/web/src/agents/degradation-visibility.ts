/**
 * Request-scoped degradation visibility - Day 62 TS port.
 *
 * Goal: keep service responses available while recording exactly which runtime
 * components degraded during a request.
 */

type DegradationSeverity = "low" | "medium" | "high";

interface DegradationEvent {
  component: string;
  reason: string;
  severity: DegradationSeverity;
  fallbackUsed: string;
}

interface RequestOutcome {
  requestId: string;
  reply: string;
  degraded: boolean;
  events: DegradationEvent[];
  elapsedMs: number;
}

class ClassifierTimeout extends Error {}
class RetrievalUnavailable extends Error {}

function classifyIntent(question: string): string {
  if (question.toLowerCase().includes("simulate")) {
    throw new ClassifierTimeout("classifier timed out at 300ms budget");
  }
  return "faq";
}

function retrieveContext(question: string): string {
  if (question.toLowerCase().includes("fscs")) {
    throw new RetrievalUnavailable("policy index temporarily unavailable");
  }
  return "retrieval context: general docs";
}

function handleRequest(requestId: string, question: string): RequestOutcome {
  const started = Date.now();
  const events: DegradationEvent[] = [];

  const record = (
    component: string,
    reason: string,
    severity: DegradationSeverity,
    fallbackUsed: string,
  ) => {
    events.push({ component, reason, severity, fallbackUsed });
  };

  let intent: string;
  try {
    intent = classifyIntent(question);
  } catch (error) {
    if (!(error instanceof ClassifierTimeout)) throw error;
    record("intent_classifier", error.message, "medium", "rule_based_intent=faq");
    intent = "faq";
  }

  let context = "";
  if (intent === "faq") {
    try {
      context = retrieveContext(question);
    } catch (error) {
      if (!(error instanceof RetrievalUnavailable)) throw error;
      record("retrieval", error.message, "high", "safe_no_context_answer");
      context = "";
    }
  }

  const reply = context
    ? "Answer from docs with evidence citations."
    : "Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now.";

  return {
    requestId,
    reply,
    degraded: events.length > 0,
    events,
    elapsedMs: Date.now() - started,
  };
}

async function main(): Promise<void> {
  console.log("--- Test 1: Healthy path stays non-degraded ---");
  let out = handleRequest("r-1001", "What is a notice account?");
  console.log(`Result: degraded=${out.degraded}, events=${out.events.length}, reply=${out.reply}`);
  if (!(out.degraded === false && out.events.length === 0)) {
    throw new Error("Expected healthy path with zero degradation events");
  }
  console.log("[VERIFIED] Healthy path produced no degradation events.");

  console.log("\n--- Test 2: Classifier timeout records degradation and fallback ---");
  out = handleRequest("r-1002", "Simulate my savings plan over 12 months");
  console.log(`Result: degraded=${out.degraded}, events=${out.events.length}, reply=${out.reply}`);
  if (
    !(out.degraded && out.events.length === 1 && out.events[0].component === "intent_classifier")
  ) {
    throw new Error("Expected one classifier degradation event");
  }
  console.log(
    `[VERIFIED] Timeout was captured with fallback metadata (${out.events[0].fallbackUsed}).`,
  );

  console.log("\n--- Test 3: Retrieval outage records high-severity degradation ---");
  out = handleRequest("r-1003", "What does FSCS cover for cash savings?");
  console.log(`Result: degraded=${out.degraded}, events=${out.events.length}, reply=${out.reply}`);
  if (!(out.degraded && out.events.length === 1)) {
    throw new Error("Expected one retrieval degradation event");
  }
  if (!(out.events[0].component === "retrieval" && out.events[0].severity === "high")) {
    throw new Error("Expected high-severity retrieval degradation");
  }
  console.log(
    `[VERIFIED] Retrieval outage was recorded as high-severity with fallback=${out.events[0].fallbackUsed}.`,
  );

  console.log("\n--- Test 4: Dual failures preserve both events in one request trace ---");
  out = handleRequest("r-1004", "Simulate FSCS coverage for my account");
  console.log(`Result: degraded=${out.degraded}, events=${out.events.length}, reply=${out.reply}`);
  if (!(out.degraded && out.events.length === 2)) {
    throw new Error("Expected two degradation events");
  }
  const components = new Set(out.events.map((event) => event.component));
  if (!(components.has("intent_classifier") && components.has("retrieval"))) {
    throw new Error("Expected classifier + retrieval events");
  }
  console.log("[VERIFIED] Multiple degradations were captured in one request-scoped trace.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
