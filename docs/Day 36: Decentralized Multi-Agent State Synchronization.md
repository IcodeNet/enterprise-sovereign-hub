Day 36 decouples sub-agents from each other entirely: instead of one controller directly calling a worker then directly calling an auditor, both agents talk only to a shared event bus and never know the other exists.

---

## Multi-Agent Orchestration — Day 36: Decentralized Multi-Agent State Synchronization

### The Problem We're Solving

As the number of concurrent sub-agents grows (a scraper, an evaluator, a summarizer, an auditor), routing every state change through one central controller that directly calls each agent in turn becomes a bottleneck - the controller has to know about every agent's existence and calling convention, and adding a new agent means modifying the controller.

A pub/sub event bus fixes this: agents publish domain events describing what just happened, and other agents independently subscribe to the event types they care about. The worker that generates code has no idea an auditor even exists - it just publishes a `CODE_PRODUCED` event, and whichever agents subscribed to that topic react to it.

Focus: an async in-memory pub/sub bus decoupling a worker agent from an auditor agent
Time investment: 15 minutes

### Step 1: Build the Event Bus

`apps/ai-engine/src/agents/event_bus_sync.py` implements a minimal async pub/sub bus: `subscribe()` registers a handler for a topic, `publish()` dispatches an event concurrently to every registered handler for that topic via `asyncio.gather`, and any handler exception is caught per-handler so one failing subscriber can't break the others:

```python
async def publish(self, event: DomainEvent) -> None:
    handlers = self._subscribers.get(event.event_type, [])
    tasks = [asyncio.create_task(self._safe_execute(h, event)) for h in handlers]
    if tasks:
        await asyncio.gather(*tasks)
```

### Step 2: Wire Two Genuinely Decoupled Agents

The worker agent subscribes to `TASK_DISPATCHED`, generates code, then publishes `CODE_PRODUCED` back onto the bus - it never calls the auditor directly. The auditor agent subscribes to `CODE_PRODUCED` independently:

```python
async def handle_task_dispatched(event: DomainEvent) -> None:
    res = await worker_agent.run(f"Write a Python function for: {task_name}")
    artifact: CodeArtifact = res.output
    await bus.publish(DomainEvent(event_type="CODE_PRODUCED", sender="WorkerAgent_01", data={...}))
```

### Step 3: Run and Verify

```
 [BUS] Handler registered for topic 'TASK_DISPATCHED'.
 [BUS] Handler registered for topic 'CODE_PRODUCED'.

--- Initiating Event Bus Workflow ---

>>> [BUS EVENT] 'TASK_DISPATCHED' from MasterOrchestrator (notifying 1 agents)
 [Worker Agent] Received dispatch for: 'Calculate prime numbers up to N using a sieve.'. Generating code...

>>> [BUS EVENT] 'CODE_PRODUCED' from WorkerAgent_01 (notifying 1 agents)
 [Auditor Agent] Reviewing generated artifact from WorkerAgent_01...
 [Auditor Verdict] The code you've provided for the Sieve of Eratosthenes algorithm is free of obvi...
```

Real, genuine end-to-end chain: publishing `TASK_DISPATCHED` triggered the worker, whose OWN publish of `CODE_PRODUCED` (nested inside the first handler's execution) triggered the auditor - proving the decoupling actually works, not just that each handler can be called in isolation. Note the `asyncio.sleep(3)` at the end of `run_pubsub_demo()`: `publish()` only awaits handlers registered at the time of THAT call, so the outer `main()` coroutine would otherwise return before the nested `CODE_PRODUCED` publish (triggered from inside `handle_task_dispatched`) has a chance to complete - a genuine ordering subtlety of fire-and-forget nested async dispatch worth calling out explicitly rather than getting lucky with timing.

---

## Best Practices

- **Catch handler exceptions per-handler, not around the whole `gather`.** `asyncio.gather` without `return_exceptions=True` would let one failing subscriber's exception propagate and cancel every other concurrently-running handler for that event - catching inside `_safe_execute` means a broken auditor doesn't take down a working worker.
- **A nested publish (a handler that itself publishes another event) needs its own await chain accounted for at the top level.** The outer caller of the FIRST publish doesn't automatically know about or wait for a SECOND publish triggered from inside a handler - this is exactly the kind of ordering bug that looks fine in a fast, lucky test run and fails silently in a slower one.
- **Decoupling through a bus means an agent's failure is isolated to its own subscription, not the publisher.** The worker publishing `CODE_PRODUCED` doesn't know or care whether the auditor's handler succeeds - that isolation is the entire point of choosing pub/sub over direct calls.

## Why This Matters in Production

Direct agent-to-agent calls create a web of dependencies that gets harder to reason about as more agents are added - a pub/sub bus keeps each agent's only real dependency as "the event types I subscribe to," which is a much smaller, more stable surface than "every agent that might need to call me directly."
