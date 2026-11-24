/**
 * Idempotent approval execution ledger - Day 61 TS port.
 *
 * Goal: once a high-risk action is approved, execute it at most once even
 * when clients retry the same request.
 */

type ApprovalStatus = "approved" | "rejected";

type ExecuteStatus = "executed" | "duplicate_replay" | "blocked_no_decision" | "blocked_rejected";

interface ApprovalDecision {
  approvalId: string;
  actionId: string;
  status: ApprovalStatus;
  reviewer: string;
  note: string;
}

interface ExecutionOutcome {
  status: ExecuteStatus;
  executed: boolean;
  executionId: string | null;
  reason: string;
}

class ApprovalExecutionLedger {
  private readonly decisions = new Map<string, ApprovalDecision>();
  private readonly executions = new Map<string, string>();

  recordDecision(decision: ApprovalDecision): void {
    this.decisions.set(decision.approvalId, decision);
  }

  executeIfApproved(approvalId: string, sideEffect: () => void): ExecutionOutcome {
    const decision = this.decisions.get(approvalId);
    if (!decision) {
      return {
        status: "blocked_no_decision",
        executed: false,
        executionId: null,
        reason: "no approval decision recorded",
      };
    }

    if (decision.status === "rejected") {
      return {
        status: "blocked_rejected",
        executed: false,
        executionId: null,
        reason: `rejected by ${decision.reviewer}: ${decision.note}`,
      };
    }

    const existingExecutionId = this.executions.get(approvalId);
    if (existingExecutionId) {
      return {
        status: "duplicate_replay",
        executed: false,
        executionId: existingExecutionId,
        reason: "already executed for this approval id",
      };
    }

    sideEffect();
    const executionId = `exec-${approvalId}`;
    this.executions.set(approvalId, executionId);
    return {
      status: "executed",
      executed: true,
      executionId,
      reason: `approved by ${decision.reviewer}: ${decision.note}`,
    };
  }
}

async function main(): Promise<void> {
  const ledger = new ApprovalExecutionLedger();
  let sideEffectCalls = 0;

  const runPaymentSideEffect = (): void => {
    sideEffectCalls += 1;
  };

  console.log("--- Test 1: Missing decision is blocked ---");
  let out = ledger.executeIfApproved("appr-missing", runPaymentSideEffect);
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "blocked_no_decision" && sideEffectCalls === 0)) {
    throw new Error("Expected missing decision to block execution");
  }
  console.log("[VERIFIED] Action did not run without a recorded decision.");

  console.log("\n--- Test 2: Rejected decision is blocked ---");
  ledger.recordDecision({
    approvalId: "appr-rejected",
    actionId: "wire-1001",
    status: "rejected",
    reviewer: "reviewer-risk",
    note: "beneficiary details incomplete",
  });
  out = ledger.executeIfApproved("appr-rejected", runPaymentSideEffect);
  console.log(`Result: status=${out.status}, executed=${out.executed}, reason=${out.reason}`);
  if (!(out.status === "blocked_rejected" && sideEffectCalls === 0)) {
    throw new Error("Expected rejected decision to block execution");
  }
  console.log("[VERIFIED] Rejected approval never reached side effects.");

  console.log("\n--- Test 3: Approved decision executes once ---");
  ledger.recordDecision({
    approvalId: "appr-approved",
    actionId: "wire-2001",
    status: "approved",
    reviewer: "reviewer-ops",
    note: "destination and amount verified",
  });
  out = ledger.executeIfApproved("appr-approved", runPaymentSideEffect);
  console.log(
    `Result: status=${out.status}, executed=${out.executed}, execution_id=${out.executionId}, reason=${out.reason}`,
  );
  if (!(out.status === "executed" && Number(sideEffectCalls) === 1)) {
    throw new Error("Expected approved decision to execute once");
  }
  console.log("[VERIFIED] Approved action executed exactly once on first call.");

  console.log("\n--- Test 4: Retry replay does not execute again ---");
  const firstExecutionId = out.executionId;
  out = ledger.executeIfApproved("appr-approved", runPaymentSideEffect);
  console.log(
    `Result: status=${out.status}, executed=${out.executed}, execution_id=${out.executionId}, reason=${out.reason}`,
  );
  if (
    !(
      out.status === "duplicate_replay" &&
      Number(sideEffectCalls) === 1 &&
      out.executionId === firstExecutionId
    )
  ) {
    throw new Error("Expected duplicate replay with no new side effect");
  }
  console.log(
    "[VERIFIED] Duplicate replay reused the original execution id with no new side effect.",
  );

  console.log("\n--- Test 5: Different approval id can execute independently ---");
  ledger.recordDecision({
    approvalId: "appr-approved-2",
    actionId: "wire-2002",
    status: "approved",
    reviewer: "reviewer-ops",
    note: "second transfer approved",
  });
  out = ledger.executeIfApproved("appr-approved-2", runPaymentSideEffect);
  console.log(
    `Result: status=${out.status}, executed=${out.executed}, execution_id=${out.executionId}, reason=${out.reason}`,
  );
  if (!(out.status === "executed" && Number(sideEffectCalls) === 2)) {
    throw new Error("Expected second approval id to execute once");
  }
  console.log("[VERIFIED] A new approval id created one new execution as expected.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
