/**
 * Human-in-the-loop gate for high-risk actions - Day 60 TS port.
 */

type RiskTier = "low" | "medium" | "high";

type GateStatus =
  | "auto_approved"
  | "auto_rejected"
  | "pending_review"
  | "human_approved"
  | "human_rejected";

interface ActionProposal {
  actionId: string;
  actionName: string;
  riskTier: RiskTier;
  confidence: number;
}

interface ReviewerDecision {
  approved: boolean;
  reviewer: string;
  note: string;
}

interface GateOutcome {
  status: GateStatus;
  executed: boolean;
  reason: string;
}

function requiresHumanReview(proposal: ActionProposal): boolean {
  if (proposal.riskTier === "high") return true;
  if (proposal.riskTier === "medium" && proposal.confidence < 0.75) return true;
  return false;
}

function evaluateGate(proposal: ActionProposal, reviewer?: ReviewerDecision): GateOutcome {
  if (proposal.riskTier === "low" && proposal.confidence >= 0.7) {
    return {
      status: "auto_approved",
      executed: true,
      reason: "low risk and high confidence",
    };
  }

  if (proposal.riskTier === "low" && proposal.confidence < 0.4) {
    return {
      status: "auto_rejected",
      executed: false,
      reason: "low risk but confidence too low",
    };
  }

  if (requiresHumanReview(proposal)) {
    if (!reviewer) {
      return {
        status: "pending_review",
        executed: false,
        reason: "human approval required",
      };
    }

    if (reviewer.approved) {
      return {
        status: "human_approved",
        executed: true,
        reason: `approved by ${reviewer.reviewer}: ${reviewer.note}`,
      };
    }

    return {
      status: "human_rejected",
      executed: false,
      reason: `rejected by ${reviewer.reviewer}: ${reviewer.note}`,
    };
  }

  return {
    status: "auto_approved",
    executed: true,
    reason: "medium risk with sufficient confidence",
  };
}

async function main(): Promise<void> {
  console.log("--- Test 1: Low risk + high confidence auto-approves ---");
  let out = evaluateGate({
    actionId: "a1",
    actionName: "show_product_list",
    riskTier: "low",
    confidence: 0.89,
  });
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "auto_approved" && out.executed)) {
    throw new Error("Expected low-risk auto-approval");
  }
  console.log("[VERIFIED] Deterministic low-risk path approved with no human step.");

  console.log("\n--- Test 2: Low risk + very low confidence auto-rejects ---");
  out = evaluateGate({
    actionId: "a2",
    actionName: "show_product_list",
    riskTier: "low",
    confidence: 0.31,
  });
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "auto_rejected" && !out.executed)) {
    throw new Error("Expected low-confidence auto-reject");
  }
  console.log("[VERIFIED] Low-confidence path was blocked before execution.");

  console.log("\n--- Test 3: High risk with no reviewer stays pending ---");
  out = evaluateGate({
    actionId: "a3",
    actionName: "submit_wire_transfer",
    riskTier: "high",
    confidence: 0.95,
  });
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "pending_review" && !out.executed)) {
    throw new Error("Expected pending review");
  }
  console.log("[VERIFIED] High-risk action halted until a human decision exists.");

  console.log("\n--- Test 4: High risk + reviewer approval executes ---");
  out = evaluateGate(
    {
      actionId: "a4",
      actionName: "submit_wire_transfer",
      riskTier: "high",
      confidence: 0.95,
    },
    { approved: true, reviewer: "reviewer-ops", note: "destination verified" },
  );
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "human_approved" && out.executed)) {
    throw new Error("Expected human-approved execution");
  }
  console.log("[VERIFIED] Human-approved high-risk action executed.");

  console.log("\n--- Test 5: High risk + reviewer rejection blocks execution ---");
  out = evaluateGate(
    {
      actionId: "a5",
      actionName: "submit_wire_transfer",
      riskTier: "high",
      confidence: 0.95,
    },
    { approved: false, reviewer: "reviewer-risk", note: "missing beneficiary proof" },
  );
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "human_rejected" && !out.executed)) {
    throw new Error("Expected human rejection block");
  }
  console.log("[VERIFIED] Human rejection prevented side effects.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
