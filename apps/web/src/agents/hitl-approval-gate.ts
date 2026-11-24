import { randomUUID } from "node:crypto";

/**
 * Human-in-the-loop approval checkpoint for high-risk tool calls - Day 39 TS port.
 *
 * High-risk actions pause and wait for an explicit human decision before
 * executing - using a Promise created with Promise.withResolvers() as the
 * pause/resume primitive in place of Python's asyncio.Future.
 */

type ActionRiskTier = "LOW" | "HIGH";

interface ToolExecutionProposal {
  actionId: string;
  targetTool: string;
  arguments: Record<string, unknown>;
  riskTier: ActionRiskTier;
  rationale: string;
}

interface HitlApprovalDecision {
  isApproved: boolean;
  reviewerNotes: string;
}

class ApprovalCheckpointRegistry {
  private pendingCheckpoints = new Map<
    string,
    {
      promise: Promise<HitlApprovalDecision>;
      resolve: (decision: HitlApprovalDecision) => void;
      settled: boolean;
    }
  >();

  registerCheckpoint(actionId: string): Promise<HitlApprovalDecision> {
    const { promise, resolve } = Promise.withResolvers<HitlApprovalDecision>();
    this.pendingCheckpoints.set(actionId, { promise, resolve, settled: false });
    return promise;
  }

  resolveCheckpoint(actionId: string, decision: HitlApprovalDecision): void {
    const entry = this.pendingCheckpoints.get(actionId);
    if (entry && !entry.settled) {
      entry.settled = true;
      this.pendingCheckpoints.delete(actionId);
      entry.resolve(decision);
      console.log(
        ` [CHECKPOINT RESOLVED] Action ${actionId} marked as Approved=${decision.isApproved}`,
      );
    }
  }
}

const registry = new ApprovalCheckpointRegistry();

async function executeDatabaseMigration(migrationName: string): Promise<string> {
  return `DATABASE MIGRATION COMPLETED: Successfully applied schema '${migrationName}'.`;
}

async function requestGuardedExecution(proposal: ToolExecutionProposal): Promise<string> {
  console.log(
    `\n[ACTION PROPOSED] Tool: '${proposal.targetTool}' | Risk Tier: ${proposal.riskTier}`,
  );
  console.log(`Rationale: ${proposal.rationale}`);

  if (proposal.riskTier === "LOW") {
    console.log(" [AUTO-APPROVED] Low-risk action executed automatically.");
    return "Executed low-risk action.";
  }

  console.log(
    ` >>> [SUSPENDED] High-risk action requires human authorization. Action ID: ${proposal.actionId}`,
  );
  const approvalPromise = registry.registerCheckpoint(proposal.actionId);

  // Genuinely suspends here without blocking the event loop - other work
  // (including the "human" resolving it) can run concurrently.
  const decision = await approvalPromise;

  if (!decision.isApproved) {
    console.log(` [BLOCKED] Action rejected by human reviewer. Reason: ${decision.reviewerNotes}`);
    return `Execution rejected by reviewer: ${decision.reviewerNotes}`;
  }

  console.log(` [APPROVED] Reviewer confirmed action. Executing tool '${proposal.targetTool}'...`);
  if (proposal.targetTool === "execute_database_migration") {
    return executeDatabaseMigration(proposal.arguments.migrationName as string);
  }
  return "Action completed successfully.";
}

async function runHitlWorkflow(): Promise<void> {
  const actionId = randomUUID().slice(0, 8);

  const dangerousProposal: ToolExecutionProposal = {
    actionId,
    targetTool: "execute_database_migration",
    arguments: { migrationName: "drop_legacy_auth_tokens_v2" },
    riskTier: "HIGH",
    rationale: "Remove obsolete authentication records to ensure compliance.",
  };

  const task = requestGuardedExecution(dangerousProposal);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  console.log(`\n[HUMAN OPERATOR INTERVENTION] Reviewing pending action: ${actionId}...`);

  registry.resolveCheckpoint(actionId, {
    isApproved: true,
    reviewerNotes:
      "Schema reviewed and verified against staging database. Approved for production.",
  });

  const result = await task;
  console.log(`\nWorkflow Outcome:\n${result}`);

  console.log("\n--- Second Scenario: Human Rejects the Action ---");
  const actionId2 = randomUUID().slice(0, 8);
  const riskyProposal2: ToolExecutionProposal = {
    actionId: actionId2,
    targetTool: "execute_database_migration",
    arguments: { migrationName: "drop_production_customers_table" },
    riskTier: "HIGH",
    rationale: "Attempting an unreviewed destructive migration.",
  };
  const task2 = requestGuardedExecution(riskyProposal2);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  registry.resolveCheckpoint(actionId2, {
    isApproved: false,
    reviewerNotes: "Destructive migration with no rollback plan - rejected.",
  });
  const result2 = await task2;
  console.log(`\nWorkflow Outcome:\n${result2}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHitlWorkflow().catch(console.error);
}
