/**
 * Distributed deadlock detection and circuit breaking across agent graphs - Day 46 TS port.
 *
 * Builds a live dependency graph of which agent is waiting on which, and
 * runs cycle detection (DFS) to catch and break a circular deadlock before
 * the agents involved spin endlessly.
 */

interface AgentWaitDependency {
  callerAgentId: string;
  waitingOnAgentId: string;
  resourceKey: string;
}

class AgentDependencyTracker {
  private adjList = new Map<string, Set<string>>();

  /** Records that caller is blocked waiting for another agent. */
  registerWait(dep: AgentWaitDependency): void {
    if (!this.adjList.has(dep.callerAgentId)) {
      this.adjList.set(dep.callerAgentId, new Set());
    }
    this.adjList.get(dep.callerAgentId)!.add(dep.waitingOnAgentId);
  }

  /** Circuit breaker mitigation: forcibly ejects an agent to free the pipeline. */
  abortAgent(agentId: string): void {
    this.adjList.delete(agentId);
    for (const dependencies of this.adjList.values()) {
      dependencies.delete(agentId);
    }
  }

  /** Runs Depth-First Search to detect circular dependency cycles. */
  findDeadlockCycle(): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cyclePath: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      cyclePath.push(node);

      for (const neighbor of this.adjList.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          cyclePath.push(neighbor);
          return true;
        }
      }

      recursionStack.delete(node);
      cyclePath.pop();
      return false;
    };

    for (const node of this.adjList.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) return cyclePath;
      }
    }
    return null;
  }
}

async function main(): Promise<void> {
  const tracker = new AgentDependencyTracker();

  console.log("Registering multi-agent execution pipeline...");
  // Simulate a circular dependency cycle: Retriever -> Evaluator -> Synthesizer -> Retriever.
  const simulatedDependencies: AgentWaitDependency[] = [
    {
      callerAgentId: "retriever_agent",
      waitingOnAgentId: "evaluator_agent",
      resourceKey: "doc_eval",
    },
    {
      callerAgentId: "evaluator_agent",
      waitingOnAgentId: "synthesis_agent",
      resourceKey: "synthesis",
    },
    {
      callerAgentId: "synthesis_agent",
      waitingOnAgentId: "retriever_agent",
      resourceKey: "citation_sync",
    },
  ];

  for (const dep of simulatedDependencies) {
    tracker.registerWait(dep);
  }

  console.log("Running cycle detection scan across agent graph...");
  const cycle = tracker.findDeadlockCycle();

  if (cycle) {
    console.log(`\n[CIRCUIT BREAKER TRIGGERED]: Deadlock cycle detected: ${cycle.join(" -> ")}`);

    const victimAgent = cycle[cycle.length - 1];
    console.log(
      `[ACTION]: Evicting blocked task '${victimAgent}' and raising error callback to supervisor.`,
    );
    tracker.abortAgent(victimAgent);

    const remainingCycle = tracker.findDeadlockCycle();
    console.log(`[HEALTH CHECK]: Post-mitigation cycle count: ${remainingCycle ? 1 : 0}`);
  } else {
    console.log("[STATUS]: Dependency graph healthy. No deadlocks found.");
  }

  console.log("\n--- Second Scenario: Genuinely Acyclic Dependency Chain ---");
  const healthyTracker = new AgentDependencyTracker();
  healthyTracker.registerWait({
    callerAgentId: "agent_a",
    waitingOnAgentId: "agent_b",
    resourceKey: "x",
  });
  healthyTracker.registerWait({
    callerAgentId: "agent_b",
    waitingOnAgentId: "agent_c",
    resourceKey: "y",
  });
  const healthyCycle = healthyTracker.findDeadlockCycle();
  console.log(
    `[STATUS]: ${healthyCycle ? "Deadlock found (BUG!)" : "Dependency graph healthy. No deadlocks found."}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
