"""Async circuit breaker & concurrency guard for agent tool calls - Day 35.

When multiple agents call external services, a slow or failing downstream
dependency can hang everything indefinitely. A circuit breaker trips to an
OPEN state after repeated failures and fast-fails immediately instead of
letting new calls pile up waiting on a service that is already down.
"""

import asyncio
import time
from enum import Enum
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


class CircuitState(str, Enum):
    CLOSED = "CLOSED"  # Normal operation.
    OPEN = "OPEN"  # Tripped: fast-fail all calls.
    HALF_OPEN = "HALF_OPEN"  # Testing recovery with a canary call.


class AgentServiceResponse(BaseModel):
    task_id: str
    status: str
    circuit_state: CircuitState
    output: str


class AsyncCircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_timeout_sec: float = 2.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout_sec
        self.failure_count = 0
        self.state = CircuitState.CLOSED
        self.last_failure_time = 0.0
        self._lock = asyncio.Lock()

    async def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        async with self._lock:
            now = time.monotonic()

            if self.state == CircuitState.OPEN:
                if now - self.last_failure_time >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    print(" [CIRCUIT] Recovery timeout reached. Transitioning to HALF_OPEN (testing recovery)...")
                else:
                    raise RuntimeError("CircuitBreakerOpen: Service temporarily unavailable.")

        try:
            result = await func(*args, **kwargs)
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    print(" [CIRCUIT] Canary request succeeded. Closing circuit breaker.")
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
            return result
        except Exception as exc:
            async with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.monotonic()
                print(f" [CIRCUIT] Call failed ({self.failure_count}/{self.failure_threshold}): {exc}")

                if self.failure_count >= self.failure_threshold or self.state == CircuitState.HALF_OPEN:
                    self.state = CircuitState.OPEN
                    print(" [CIRCUIT ALERT] Failure threshold reached. Circuit breaker is now OPEN.")
            raise


breaker = AsyncCircuitBreaker(failure_threshold=2, recovery_timeout_sec=1.5)


async def unreliable_remote_service(payload: str) -> str:
    # Simulates a slow or crashing external API.
    if "simulate_fail" in payload:
        raise ConnectionResetError("Downstream service crashed.")
    return f"Processed successfully: '{payload}'"


async def execute_resilient_agent_call(task_id: str, prompt: str) -> AgentServiceResponse:
    print(f"\nDispatching task '{task_id}'...")
    try:
        # Enforce a timeout guard in addition to circuit breaker protection.
        output = await asyncio.wait_for(breaker.call(unreliable_remote_service, prompt), timeout=3.0)
        return AgentServiceResponse(task_id=task_id, status="SUCCESS", circuit_state=breaker.state, output=output)
    except Exception as exc:
        return AgentServiceResponse(task_id=task_id, status="FAILED", circuit_state=breaker.state, output=str(exc))


async def main() -> None:
    # Fail twice - trips the breaker to OPEN.
    for i in range(2):
        result = await execute_resilient_agent_call(f"fail-{i}", "simulate_fail this request")
        print(f"Result: {result.status} | Circuit: {result.circuit_state.value} | {result.output}")

    # This call should fast-fail immediately (breaker is OPEN), no network wait.
    fast_fail_start = time.monotonic()
    result = await execute_resilient_agent_call("blocked-call", "a perfectly fine request")
    fast_fail_duration_ms = (time.monotonic() - fast_fail_start) * 1000
    print(f"Result: {result.status} | Circuit: {result.circuit_state.value} | {result.output}")
    print(f"Fast-fail took {fast_fail_duration_ms:.1f}ms (proves no network call was attempted)")

    # Wait for the recovery window, then a good request should close the breaker again.
    print("\nWaiting for recovery timeout...")
    await asyncio.sleep(1.6)
    result = await execute_resilient_agent_call("recovery-probe", "a perfectly fine request")
    print(f"Result: {result.status} | Circuit: {result.circuit_state.value} | {result.output}")


if __name__ == "__main__":
    asyncio.run(main())
