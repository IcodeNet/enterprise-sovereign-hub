/**
 * Async circuit breaker & concurrency guard for agent tool calls - Day 35 TS port.
 *
 * Same CLOSED -> OPEN -> HALF_OPEN -> CLOSED lifecycle as the Python side:
 * repeated failures trip the breaker to fast-fail immediately, then a single
 * canary request after the recovery window decides whether to close again.
 */

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

interface AgentServiceResponse {
  taskId: string;
  status: "SUCCESS" | "FAILED";
  circuitState: CircuitState;
  output: string;
}

class AsyncCircuitBreaker {
  private failureCount = 0;
  private state: CircuitState = CircuitState.CLOSED;
  private lastFailureTime = 0;
  // No native async mutex in JS - same Promise-chain approach proven on Day 29's rate limiter.
  private mutexQueue: Promise<void> = Promise.resolve();

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const previous = this.mutexQueue;
    this.mutexQueue = promise;
    await previous;
    try {
      return await fn();
    } finally {
      resolve();
    }
  }

  constructor(
    private failureThreshold: number = 3,
    private recoveryTimeoutMs: number = 2000,
  ) {}

  get currentState(): CircuitState {
    return this.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    await this.withLock(() => {
      const now = Date.now();
      if (this.state === CircuitState.OPEN) {
        if (now - this.lastFailureTime >= this.recoveryTimeoutMs) {
          this.state = CircuitState.HALF_OPEN;
          console.log(
            " [CIRCUIT] Recovery timeout reached. Transitioning to HALF_OPEN (testing recovery)...",
          );
        } else {
          throw new Error("CircuitBreakerOpen: Service temporarily unavailable.");
        }
      }
    });

    try {
      const result = await fn();
      await this.withLock(() => {
        if (this.state === CircuitState.HALF_OPEN) {
          console.log(" [CIRCUIT] Canary request succeeded. Closing circuit breaker.");
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
        }
      });
      return result;
    } catch (error) {
      await this.withLock(() => {
        this.failureCount += 1;
        this.lastFailureTime = Date.now();
        console.log(
          ` [CIRCUIT] Call failed (${this.failureCount}/${this.failureThreshold}): ${(error as Error).message}`,
        );
        if (this.failureCount >= this.failureThreshold || this.state === CircuitState.HALF_OPEN) {
          this.state = CircuitState.OPEN;
          console.log(" [CIRCUIT ALERT] Failure threshold reached. Circuit breaker is now OPEN.");
        }
      });
      throw error;
    }
  }
}

const breaker = new AsyncCircuitBreaker(2, 1500);

async function unreliableRemoteService(payload: string): Promise<string> {
  if (payload.includes("simulate_fail")) {
    throw new Error("Downstream service crashed.");
  }
  return `Processed successfully: '${payload}'`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out")), timeoutMs)),
  ]);
}

async function executeResilientAgentCall(
  taskId: string,
  prompt: string,
): Promise<AgentServiceResponse> {
  console.log(`\nDispatching task '${taskId}'...`);
  try {
    const output = await withTimeout(
      breaker.call(() => unreliableRemoteService(prompt)),
      3000,
    );
    return { taskId, status: "SUCCESS", circuitState: breaker.currentState, output };
  } catch (error) {
    return {
      taskId,
      status: "FAILED",
      circuitState: breaker.currentState,
      output: (error as Error).message,
    };
  }
}

async function main(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const result = await executeResilientAgentCall(`fail-${i}`, "simulate_fail this request");
    console.log(`Result: ${result.status} | Circuit: ${result.circuitState} | ${result.output}`);
  }

  const fastFailStart = Date.now();
  const blocked = await executeResilientAgentCall("blocked-call", "a perfectly fine request");
  const fastFailDurationMs = Date.now() - fastFailStart;
  console.log(`Result: ${blocked.status} | Circuit: ${blocked.circuitState} | ${blocked.output}`);
  console.log(`Fast-fail took ${fastFailDurationMs}ms (proves no network call was attempted)`);

  console.log("\nWaiting for recovery timeout...");
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const recovered = await executeResilientAgentCall("recovery-probe", "a perfectly fine request");
  console.log(
    `Result: ${recovered.status} | Circuit: ${recovered.circuitState} | ${recovered.output}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
