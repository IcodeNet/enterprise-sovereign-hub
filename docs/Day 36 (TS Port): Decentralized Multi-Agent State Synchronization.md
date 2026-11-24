Day 36's TypeScript port builds the same decoupled pub/sub bus, and finds a genuine, favorable cross-language difference: `Promise.all` naturally avoids the nested-publish ordering subtlety the Python side needed an explicit `sleep()` to work around.

---

## Multi-Agent Orchestration — Day 36 (TS Port): Decentralized Multi-Agent State Synchronization

### The Problem We're Solving

Same problem as the Python lesson: routing every state change through one central controller that directly calls each sub-agent becomes a bottleneck as agent count grows. A pub/sub bus decouples the worker (which generates code) from the auditor (which reviews it) - neither knows the other exists.

Focus: the same async in-memory pub/sub bus, built with native Promises
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the bus (`class AsyncEventBus`) | the bus (`class AsyncEventBus`) |
| dispatching to all subscribers concurrently (`asyncio.gather(*tasks)`) | dispatching to all subscribers concurrently (`Promise.all(handlers.map(...))`) |
| catching a handler's own failure without breaking others (`try/except` inside `_safe_execute`) | catching a handler's own failure without breaking others (`try/catch` inside `safeExecute`) |
| the worker's output shape (`class CodeArtifact(BaseModel)`) | the worker's output shape (`const CodeArtifactSchema = z.object({...})`) |
| the auditor's free-text review (`await auditor_agent.run(prompt)`, `eval_res.output`) | the auditor's free-text review (`await generateText({ model, prompt })`, `text`) |

### Step 1: Build the Bus

```typescript
async publish(event: DomainEvent): Promise<void> {
  const handlers = this.subscribers.get(event.eventType) ?? [];
  await Promise.all(handlers.map((h) => this.safeExecute(h, event)));
}
```

### Step 2: Run and Verify

```
 [BUS] Handler registered for topic 'TASK_DISPATCHED'.
 [BUS] Handler registered for topic 'CODE_PRODUCED'.

--- Initiating Event Bus Workflow ---

>>> [BUS EVENT] 'TASK_DISPATCHED' from MasterOrchestrator (notifying 1 agents)
 [Worker Agent] Received dispatch for: 'Calculate prime numbers up to N using a sieve.'. Generating code...

>>> [BUS EVENT] 'CODE_PRODUCED' from WorkerAgent_01 (notifying 1 agents)
 [Auditor Agent] Reviewing generated artifact from WorkerAgent_01...
 [Auditor Verdict] The code you've provided implements the Sieve of Eratosthenes, and it has no obv...
```

Same real end-to-end chain as Python: publishing `TASK_DISPATCHED` triggers the worker, whose own nested publish of `CODE_PRODUCED` triggers the auditor.

### Step 3: A Genuine, Favorable Cross-Language Difference - No `sleep()` Needed

The Python side needed an explicit `asyncio.sleep(3)` at the end of its demo because `publish()`'s own `await asyncio.gather(*tasks)` doesn't chain through a NESTED publish call made from inside one of those tasks - the outer `main()` coroutine has no reference to that nested awaitable and would return before it finishes without the sleep.

The TypeScript version doesn't have this problem, for a structural reason: `handleTaskDispatched` is itself `async`, and its own `await bus.publish(...)` for `CODE_PRODUCED` is INSIDE the body of the promise that `Promise.all` in the outer `publish()` call is already awaiting. Because the handler function is one continuous `async` function body, awaiting the nested publish is just another `await` in the same call stack that the outer `Promise.all` is tracking - there's no separate "fire and forget" task boundary the way Python's `asyncio.create_task()` creates one. No artificial `sleep()` was needed; `tsx` exits naturally only after every awaited promise in the chain resolves.

`tsc --noEmit` and `oxlint` both clean (after moving `handleCodeProduced` to module scope to satisfy a "does not capture any variables from its parent scope" lint rule). `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **`asyncio.create_task()` creates an independently-scheduled task that the awaiting code loses track of** unless it's explicitly collected and awaited - this is a genuine Python-specific subtlety that a straightforward async/await chain in JS doesn't have, because JS's `Promise.all` over an array of `async` function calls keeps the WHOLE call chain (including any nested awaits inside those functions) within what it's waiting on.
- **When porting an async orchestration pattern between languages, check whether a workaround (like a `sleep()`) was compensating for a language-specific scheduling quirk, not a universal requirement of the pattern itself.** Blindly porting the `sleep()` into the TS version would have been unnecessary defensive code masking a bug that doesn't exist in this language.

## Why This Port Matters in Production

The same event-bus decoupling pattern holds across both languages, but the two async models track "is this event bus call actually finished" differently under the hood - Python's task-based concurrency needed an explicit wait for a fire-and-forget nested publish, while JS's promise-chain concurrency naturally kept the whole nested chain inside what the outer caller was already awaiting. Understanding why removes a piece of unnecessary defensive code rather than superstitiously copying it across languages.
