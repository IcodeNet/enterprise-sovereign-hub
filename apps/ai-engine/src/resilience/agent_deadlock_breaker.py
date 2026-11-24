"""Distributed deadlock detection and circuit breaking across agent graphs - Day 46.

In multi-agent topologies, specialist agents often wait on outputs or tool
permissions from one another. If Agent A waits on B, B waits on C, and C
waits on A, a circular deadlock forms - the nodes spin endlessly, burning
API quota with no progress. This builds a live dependency graph and runs
cycle detection to catch and break that deadlock automatically.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class AgentWaitDependency(BaseModel):
    caller_agent_id: str
    waiting_on_agent_id: str
    resource_key: str


class CircuitBreakerStatus(BaseModel):
    is_deadlocked: bool
    detected_cycle: list[str] = Field(default_factory=list)
    action_taken: str


class AgentDependencyTracker:
    def __init__(self):
        self.adj_list: dict[str, set[str]] = {}

    def register_wait(self, dep: AgentWaitDependency) -> None:
        """Records that caller is blocked waiting for another agent."""
        if dep.caller_agent_id not in self.adj_list:
            self.adj_list[dep.caller_agent_id] = set()
        self.adj_list[dep.caller_agent_id].add(dep.waiting_on_agent_id)

    def release_wait(self, caller_id: str, completed_id: str) -> None:
        """Clears wait state once dependent task completes."""
        if caller_id in self.adj_list:
            self.adj_list[caller_id].discard(completed_id)

    def abort_agent(self, agent_id: str) -> None:
        """Circuit breaker mitigation: forcibly ejects an agent to free the pipeline."""
        self.adj_list.pop(agent_id, None)
        for _, dependencies in self.adj_list.items():
            dependencies.discard(agent_id)

    def find_deadlock_cycle(self) -> list[str] | None:
        """Runs Depth-First Search to detect circular dependency cycles."""
        visited: set[str] = set()
        recursion_stack: set[str] = set()
        cycle_path: list[str] = []

        def dfs(node: str) -> bool:
            visited.add(node)
            recursion_stack.add(node)
            cycle_path.append(node)

            for neighbor in self.adj_list.get(node, set()):
                if neighbor not in visited:
                    if dfs(neighbor):
                        return True
                elif neighbor in recursion_stack:
                    cycle_path.append(neighbor)
                    return True

            recursion_stack.remove(node)
            cycle_path.pop()
            return False

        for node in list(self.adj_list.keys()):
            if node not in visited:
                if dfs(node):
                    return cycle_path
        return None


async def main() -> None:
    tracker = AgentDependencyTracker()

    print("Registering multi-agent execution pipeline...")
    # Simulate a circular dependency cycle: Retriever -> Evaluator -> Synthesizer -> Retriever.
    simulated_dependencies = [
        AgentWaitDependency(caller_agent_id="retriever_agent", waiting_on_agent_id="evaluator_agent", resource_key="doc_eval"),
        AgentWaitDependency(caller_agent_id="evaluator_agent", waiting_on_agent_id="synthesis_agent", resource_key="synthesis"),
        AgentWaitDependency(caller_agent_id="synthesis_agent", waiting_on_agent_id="retriever_agent", resource_key="citation_sync"),
    ]

    for dep in simulated_dependencies:
        tracker.register_wait(dep)

    print("Running cycle detection scan across agent graph...")
    cycle = tracker.find_deadlock_cycle()

    if cycle:
        cycle_representation = " -> ".join(cycle)
        print(f"\n[CIRCUIT BREAKER TRIGGERED]: Deadlock cycle detected: {cycle_representation}")

        victim_agent = cycle[-1]
        print(f"[ACTION]: Evicting blocked task '{victim_agent}' and raising error callback to supervisor.")
        tracker.abort_agent(victim_agent)

        remaining_cycle = tracker.find_deadlock_cycle()
        print(f"[HEALTH CHECK]: Post-mitigation cycle count: {1 if remaining_cycle else 0}")
    else:
        print("[STATUS]: Dependency graph healthy. No deadlocks found.")

    # Real proof the healthy path also works correctly: a non-circular
    # (acyclic) dependency chain should NOT trigger the breaker at all.
    print("\n--- Second Scenario: Genuinely Acyclic Dependency Chain ---")
    healthy_tracker = AgentDependencyTracker()
    healthy_tracker.register_wait(AgentWaitDependency(caller_agent_id="agent_a", waiting_on_agent_id="agent_b", resource_key="x"))
    healthy_tracker.register_wait(AgentWaitDependency(caller_agent_id="agent_b", waiting_on_agent_id="agent_c", resource_key="y"))
    healthy_cycle = healthy_tracker.find_deadlock_cycle()
    print(f"[STATUS]: {'Deadlock found (BUG!)' if healthy_cycle else 'Dependency graph healthy. No deadlocks found.'}")


if __name__ == "__main__":
    asyncio.run(main())
