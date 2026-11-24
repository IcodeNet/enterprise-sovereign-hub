"""Decentralized multi-agent state synchronization via an async pub/sub bus - Day 36.

Rather than routing every state change through one central controller (a
bottleneck as agent count grows), sub-agents publish domain events onto a
shared bus and independently subscribe to the events they care about -
no direct coupling between the worker and the auditor.
"""

import asyncio
from collections import defaultdict
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()


class DomainEvent(BaseModel):
    event_type: str
    sender: str
    data: dict[str, Any]


class CodeArtifact(BaseModel):
    task_id: str
    python_snippet: str
    explanation: str


class AsyncEventBus:
    def __init__(self):
        self._subscribers: dict[str, list[Callable[[DomainEvent], Any]]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Callable[[DomainEvent], Any]) -> None:
        self._subscribers[event_type].append(handler)
        print(f" [BUS] Handler registered for topic '{event_type}'.")

    async def publish(self, event: DomainEvent) -> None:
        handlers = self._subscribers.get(event.event_type, [])
        print(f"\n>>> [BUS EVENT] '{event.event_type}' from {event.sender} (notifying {len(handlers)} agents)")

        # Dispatch the event concurrently to every subscriber.
        tasks = [asyncio.create_task(self._safe_execute(h, event)) for h in handlers]
        if tasks:
            await asyncio.gather(*tasks)

    async def _safe_execute(self, handler: Callable, event: DomainEvent) -> None:
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                handler(event)
        except Exception as exc:
            print(f" [BUS ERROR] Handler execution failed: {exc}")


worker_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=CodeArtifact,
    system_prompt="We are a focused code generation sub-agent. Always fill task_id with a short slug you invent.",
)

auditor_agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt="We are an auditor agent inspecting incoming code events for production safety.",
)


async def run_pubsub_demo() -> None:
    bus = AsyncEventBus()

    async def handle_task_dispatched(event: DomainEvent) -> None:
        task_name = event.data.get("task_description")
        print(f" [Worker Agent] Received dispatch for: '{task_name}'. Generating code...")

        res = await worker_agent.run(f"Write a Python function for: {task_name}")
        artifact: CodeArtifact = res.output

        # Publish a completion event back onto the bus - the worker never
        # calls the auditor directly, it has no idea the auditor even exists.
        await bus.publish(
            DomainEvent(
                event_type="CODE_PRODUCED",
                sender="WorkerAgent_01",
                data={"task_id": artifact.task_id, "code": artifact.python_snippet},
            )
        )

    async def handle_code_produced(event: DomainEvent) -> None:
        code = event.data.get("code")
        print(f" [Auditor Agent] Reviewing generated artifact from {event.sender}...")

        eval_res = await auditor_agent.run(f"Verify if this code has obvious syntax issues:\n{code}")
        print(f" [Auditor Verdict] {eval_res.output[:80]}...")

    bus.subscribe("TASK_DISPATCHED", handle_task_dispatched)
    bus.subscribe("CODE_PRODUCED", handle_code_produced)

    print("\n--- Initiating Event Bus Workflow ---")
    await bus.publish(
        DomainEvent(
            event_type="TASK_DISPATCHED",
            sender="MasterOrchestrator",
            data={"task_description": "Calculate prime numbers up to N using a sieve."},
        )
    )

    # Give the fire-and-forget CODE_PRODUCED handler a moment to finish -
    # publish() only awaits handlers registered at THAT publish call, and
    # handle_task_dispatched's own bus.publish() runs as a nested async
    # call inside the gathered task, so this main coroutine returns before
    # nested publishes necessarily complete unless we wait for them too.
    await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run_pubsub_demo())
