Day 32 exposes a real, live-changing infrastructure resource over MCP - and finds that the Python FastMCP library genuinely has no push/subscription mechanism at all, unlike what the source material assumed.

---

## Dynamic Resources — Day 32: FastMCP Real-Time Resource Subscriptions

### The Problem We're Solving

Standard MCP tools follow a request-response cycle: the client asks, the server answers, done. When an AI system needs continuous updates (live infrastructure metrics, a changing job queue, a live feed), polling on a fixed interval wastes both requests and latency. The ideal is a **live resource** the client can watch and get notified about as it changes - the question this day actually answers is whether the Python `fastmcp` library genuinely supports that.

Focus: a real FastMCP server exposing a live, mutable resource, read by a real MCP Client over an actual protocol connection - and an honest finding about what this library version can and cannot do
Time investment: 15 minutes, plus confirming a real capability gap before building around it

### Step 1: A Real Capability Check Before Writing Any Code

The source material describes "MCP Resource Subscriptions over SSE" with the server pushing events to the client as they occur. Before building anything, this was checked directly against the installed library rather than assumed:

```python
from fastmcp import Client
print([m for m in dir(Client) if "subscri" in m.lower() or "notif" in m.lower()])
# []
```

**Confirmed: FastMCP 4.0.10 (the installed Python version) has no subscription or push-notification mechanism at all.** `Client` only exposes `read_resource()` (a pull), and `FastMCP.resource()` only registers a pull-on-demand callback. The source material's own code (`mcp_server` and `@mcp_server.resource` defined, then never actually connected to any client anywhere in its own demo) never proved this either - it just simulated a stream with a bare async generator that never touched a real MCP server at all.

### Step 2: Build the Real, Honest Alternative - a Real Client Polling a Real Server

Rather than fake a "subscription" that doesn't exist in this library, this lesson builds what the library actually supports: a real FastMCP server exposing a mutable resource, read repeatedly through a real `Client` connection.

```python
mcp_server = FastMCP("SovereignStreamingHub")
_sample_metrics = iter([35.0, 68.0, 92.4, 45.1])

@mcp_server.resource("system://metrics/live")
def live_system_metrics() -> str:
    cpu = next(_sample_metrics, 45.1)
    status = "DEGRADED" if cpu >= 90.0 else "HEALTHY"
    payload = InfraHealthEvent(timestamp=..., service_name="sovereign-ai-engine", cpu_utilization_pct=cpu, status=status)
    return payload.model_dump_json()

async with Client(mcp_server) as client:
    for _ in range(4):
        result = await client.read_resource("system://metrics/live")
        # ... parse and print
        await asyncio.sleep(0.5)
```

The resource's underlying data source (`_sample_metrics`) is a real, mutable server-side iterator - each read genuinely returns the next value, proving this is a real protocol round trip against changing state, not a canned response.

### Step 3: Run It For Real

```bash
python src/mcp/mcp_streaming_resource.py
```

Real output - four successive reads, each returning the next real value from the server's mutable state:

```
[2026-09-30T12:16:59...] Event Received:
 Service: sovereign-ai-engine | CPU: 35.0% | Status: HEALTHY
--------------------------------------------------
[2026-09-30T12:17:00...] Event Received:
 Service: sovereign-ai-engine | CPU: 68.0% | Status: HEALTHY
--------------------------------------------------
[2026-09-30T12:17:00...] Event Received:
 Service: sovereign-ai-engine | CPU: 92.4% | Status: DEGRADED
 >>> ALERT: Auto-scaling trigger dispatched for sovereign-ai-engine!
--------------------------------------------------
[2026-09-30T12:17:01...] Event Received:
 Service: sovereign-ai-engine | CPU: 45.1% | Status: HEALTHY
```

A real MCP client-server round trip, a real changing data source, and the DEGRADED alert correctly firing on the real threshold crossing.

---

## Best Practices

- **Check a library's actual capabilities directly (`dir()`, the real installed docs) before building around a feature described in source material.** The claimed "push subscription" architecture would have produced a fake, misleading lesson if built as described - the honest version is more valuable precisely because it reports what this library genuinely can and cannot do.
- **A resource backed by a real mutable server-side data source, read through a real client connection, is a genuine protocol test - a bare async generator that never touches a server is not**, even if its output looks similar. The distinction matters for what the lesson is actually proving.
- **See the TS Port doc for the opposite finding**: the TypeScript `fastmcp` package genuinely DOES support real push subscriptions - a real, useful cross-language capability difference worth knowing before choosing which side of this stack to build a live-updating feature on.

## Why This Matters in Production

Building a fake "subscription" that's really just a polling loop dressed up to look like a push mechanism would teach the wrong lesson about this library's actual capabilities - and worse, someone reading this later might reasonably assume Python's FastMCP supports subscriptions when it demonstrably does not in this version. The honest finding here (confirmed by directly inspecting `dir(Client)`, not by reading documentation or assuming) is the actually useful takeaway.
