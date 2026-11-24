import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

/**
 * Decentralized multi-agent state synchronization via an async pub/sub bus - Day 36 TS port.
 *
 * Sub-agents publish domain events onto a shared bus and independently
 * subscribe to the events they care about - no direct coupling between the
 * worker and the auditor.
 */

interface DomainEvent {
  eventType: string;
  sender: string;
  data: Record<string, unknown>;
}

const CodeArtifactSchema = z.object({
  taskId: z.string(),
  pythonSnippet: z.string(),
  explanation: z.string(),
});

type EventHandler = (event: DomainEvent) => Promise<void> | void;

class AsyncEventBus {
  private subscribers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.subscribers.get(eventType) ?? [];
    handlers.push(handler);
    this.subscribers.set(eventType, handlers);
    console.log(` [BUS] Handler registered for topic '${eventType}'.`);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.subscribers.get(event.eventType) ?? [];
    console.log(
      `\n>>> [BUS EVENT] '${event.eventType}' from ${event.sender} (notifying ${handlers.length} agents)`,
    );

    // Dispatch the event concurrently to every subscriber.
    await Promise.all(handlers.map((h) => this.safeExecute(h, event)));
  }

  private async safeExecute(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      console.log(` [BUS ERROR] Handler execution failed: ${(error as Error).message}`);
    }
  }
}

const handleCodeProduced: EventHandler = async (event) => {
  const code = event.data.code as string;
  console.log(` [Auditor Agent] Reviewing generated artifact from ${event.sender}...`);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: "We are an auditor agent inspecting incoming code events for production safety.",
    prompt: `Verify if this code has obvious syntax issues:\n${code}`,
  });
  console.log(` [Auditor Verdict] ${text.slice(0, 80)}...`);
};

async function runPubSubDemo(): Promise<void> {
  const bus = new AsyncEventBus();

  const handleTaskDispatched: EventHandler = async (event) => {
    const taskName = event.data.taskDescription as string;
    console.log(` [Worker Agent] Received dispatch for: '${taskName}'. Generating code...`);

    const { object: artifact } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: CodeArtifactSchema,
      system:
        "We are a focused code generation sub-agent. Always fill taskId with a short slug you invent.",
      prompt: `Write a JavaScript function for: ${taskName}`,
    });

    // Publish a completion event back onto the bus - the worker never
    // calls the auditor directly, it has no idea the auditor even exists.
    await bus.publish({
      eventType: "CODE_PRODUCED",
      sender: "WorkerAgent_01",
      data: { taskId: artifact.taskId, code: artifact.pythonSnippet },
    });
  };

  bus.subscribe("TASK_DISPATCHED", handleTaskDispatched);
  bus.subscribe("CODE_PRODUCED", handleCodeProduced);

  console.log("\n--- Initiating Event Bus Workflow ---");
  await bus.publish({
    eventType: "TASK_DISPATCHED",
    sender: "MasterOrchestrator",
    data: { taskDescription: "Calculate prime numbers up to N using a sieve." },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPubSubDemo().catch(console.error);
}
