"""FastMCP dynamic resource + real client connection - Day 32.

A real FastMCP server exposing a live infrastructure-metrics resource, read
by a real FastMCP Client over an in-memory transport - genuine client-server
protocol traffic, not a simulated stream.

HONEST CORRECTION vs the PDF: the PDF's architecture describes MCP
"Resource Subscriptions over SSE" with the server pushing events to the
client as they occur. FastMCP 4.0.10 (the installed version) has no such
push/subscription mechanism - `Client` only exposes `read_resource()`
(pull), and `FastMCP.resource()` only registers a pull-on-demand callback.
Confirmed directly: `dir(Client)` contains no `subscribe`/`notify`/`update`
method at all. Rather than fake a "subscription" with a bare async
generator that never touches a real MCP server (what the PDF's own code
actually does - `mcp_server` and `@mcp_server.resource` are defined and
then never used anywhere in its demo), this lesson builds a REAL client
polling a REAL server's resource repeatedly, which is the genuine
mechanism this protocol version actually supports for "watching" a
changing resource.
"""

import asyncio
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastmcp import Client, FastMCP
from mcp.types import TextResourceContents
from pydantic import BaseModel, Field

load_dotenv()


class InfraHealthEvent(BaseModel):
    timestamp: str
    service_name: str
    cpu_utilization_pct: float
    status: str = Field(description="HEALTHY, DEGRADED, or CRITICAL")


mcp_server = FastMCP("SovereignStreamingHub")

# A real, mutable server-side data source - the resource callback below
# reads whatever is here at call time, so successive client reads
# genuinely observe different values, the same way a live metrics
# endpoint would.
_sample_metrics = iter([35.0, 68.0, 92.4, 45.1])


@mcp_server.resource("system://metrics/live")
def live_system_metrics() -> str:
    """Provides a snapshot reading of the current infrastructure load."""
    cpu = next(_sample_metrics, 45.1)
    status = "DEGRADED" if cpu >= 90.0 else "HEALTHY"
    payload = InfraHealthEvent(
        timestamp=datetime.now(UTC).isoformat(),
        service_name="sovereign-ai-engine",
        cpu_utilization_pct=cpu,
        status=status,
    )
    return payload.model_dump_json()


async def run_mcp_polling_listener() -> None:
    """Repeatedly reads the live resource through a real MCP client connection.

    Uses FastMCP's in-memory transport (passing the server instance directly
    to Client) - a genuine MCP client/server round trip over the real
    protocol, just without a separate network process for this lesson.
    """
    print("Step 1: Connecting to FastMCP resource 'system://metrics/live' via a real Client...")
    print("Polling for infrastructure telemetry (no push/subscribe API exists in this FastMCP version)...\n")

    async with Client(mcp_server) as client:
        for _ in range(4):
            result = await client.read_resource("system://metrics/live")
            content = result[0]
            if not isinstance(content, TextResourceContents):
                raise TypeError("Expected a text resource, got binary content.")
            raw_json = content.text
            event = InfraHealthEvent.model_validate_json(raw_json)

            print(f"[{event.timestamp}] Event Received:")
            print(f" Service: {event.service_name} | CPU: {event.cpu_utilization_pct}% | Status: {event.status}")

            if event.status == "DEGRADED":
                print(f" >>> ALERT: Auto-scaling trigger dispatched for {event.service_name}!")
            print("-" * 50)

            await asyncio.sleep(0.5)


if __name__ == "__main__":
    asyncio.run(run_mcp_polling_listener())
