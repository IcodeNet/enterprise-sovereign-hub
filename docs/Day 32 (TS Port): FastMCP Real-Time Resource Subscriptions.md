Day 32's TypeScript port finds the OPPOSITE capability gap from the Python side - the TS `fastmcp` package genuinely supports real server-push resource subscriptions, and this lesson builds and verifies the real mechanism rather than a polling workaround.

---

## Dynamic Resources — Day 32 (TS Port): FastMCP Real-Time Resource Subscriptions

### The Problem We're Solving

Standard MCP tools follow a request-response cycle. When a client needs continuous updates on a changing resource, polling wastes requests and adds latency. The Python side of this lesson found that Python's `fastmcp` library has no push mechanism at all - this TypeScript port checks the same question independently against the TS ecosystem, with a genuinely different result.

Focus: verifying whether the TypeScript `fastmcp` package supports real resource-subscription push, and building the real mechanism if it does
Time investment: 15 minutes, plus real protocol debugging once the capability was confirmed to exist

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the server (`FastMCP("SovereignStreamingHub")`) | the server (`fastmcp` 4.22.0, `server.start({ transportType: "httpStream", httpStream: { port: PORT } })`) |
| the live resource (`@mcp_server.resource("system://metrics/live")` on `live_system_metrics()`) | the live resource (`server.addResource({ uri: RESOURCE_URI, ..., async load() {...} })`) |
| connecting the client (`async with Client(mcp_server) as client:`) | connecting the client (`await client.connect(new StreamableHTTPClientTransport(new URL(...)))`) |
| getting new values (polling: `await client.read_resource("system://metrics/live")` then `asyncio.sleep(0.5)`) | getting new values (real push: `await client.subscribeResource({ uri: RESOURCE_URI })`, server calls `serverSession.sendResourceUpdated(RESOURCE_URI)`) |
| reacting to a change (parsing each read inside the poll loop) | reacting to a change (`client.setNotificationHandler(ResourceUpdatedNotificationSchema, ...)` re-reading via `client.readResource({ uri: notification.params.uri })`) |

### Step 1: A Real Capability Check - and the Opposite Finding From Python

Checked directly against the installed TypeScript SDK's own type definitions before writing any code:

```bash
grep -n "sendResourceUpdated\|subscribeResource" node_modules/fastmcp/dist/FastMCP.d.ts node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts
```

**Confirmed: the TypeScript `fastmcp` package (4.22.0) genuinely DOES support real push notifications** - `sendResourceUpdated(uri)` on the server ("Notifies the connected client that the contents of a resource have changed... only sent when the client has subscribed... via `resources/subscribe`") and `subscribeResource()` plus a `ResourceUpdatedNotificationSchema` handler on the client. This is a real, opposite-direction ecosystem gap from the Python side (documented in the Python doc) - and it made building the ACTUAL described architecture (real server push, not a poll loop) possible here.

### Step 2: Build a Real Server, Real Client, Real Subscription

```typescript
server.addResource({
  uri: RESOURCE_URI,
  name: "Live Infrastructure Metrics",
  async load() {
    return { text: JSON.stringify(buildCurrentEvent()) };
  },
});
await server.start({ transportType: "httpStream", httpStream: { port: PORT } });

const client = new Client({ name: "sovereign-hub-listener", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`)));

client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification) => {
  const result = await client.readResource({ uri: notification.params.uri });
  // ... parse and print
});
await client.subscribeResource({ uri: RESOURCE_URI });

for (const _ of sampleMetrics) {
  await new Promise((r) => setTimeout(r, 500));
  await serverSession.sendResourceUpdated(RESOURCE_URI);
}
```

### Step 3: A Real Bug Found and Fixed - Manually Setting the Session ID Breaks the Handshake

First run failed with `Session not found` on the very first request. Root cause: the client code initially passed a manually pre-generated `sessionId` into `StreamableHTTPClientTransport`'s constructor options, before the MCP `initialize` handshake had even happened - the server assigns the session ID as part of that handshake, so pre-supplying one broke the protocol's own state machine. Fixed by removing the manual `sessionId` entirely and letting the transport manage it.

### Step 4: Run It For Real

Real output - four genuine server-initiated push notifications received over a real HTTP connection, not polled:

```
[2026-09-30T12:19:42.204Z] Push Notification #1 Received:
 Service: sovereign-ai-engine | CPU: 35% | Status: HEALTHY
--------------------------------------------------
[2026-09-30T12:19:42.704Z] Push Notification #2 Received:
 Service: sovereign-ai-engine | CPU: 68% | Status: HEALTHY
--------------------------------------------------
[2026-09-30T12:19:43.206Z] Push Notification #3 Received:
 Service: sovereign-ai-engine | CPU: 92.4% | Status: DEGRADED
 >>> ALERT: Auto-scaling trigger dispatched for sovereign-ai-engine!
--------------------------------------------------
[2026-09-30T12:19:43.707Z] Push Notification #4 Received:
 Service: sovereign-ai-engine | CPU: 45.1% | Status: HEALTHY
--------------------------------------------------

Total real push notifications received: 4
```

Each notification triggered the client's handler to actually re-read the resource and re-parse it - a real, working subscribe → notify → re-fetch cycle, over a real network connection (`localhost` HTTP, but the real MCP Streamable HTTP transport, not an in-memory shortcut).

`tsc --noEmit` and `oxlint` both clean.

---

## Best Practices

- **The two languages' real capabilities can genuinely differ for the same protocol** - Python's `fastmcp` has no subscription mechanism in the installed version; TypeScript's does. Neither assumption ("they're always at parity" or "the newer/more actively developed one is always ahead") should be trusted without checking each side directly.
- **A `Session not found` error on the very first request after connecting is a strong signal the client is interfering with the transport's own session management**, not a server-side bug - check whether client code is manually supplying something (a session ID, a pre-set header) that the protocol's handshake is supposed to assign itself.
- **Verify a "push" claim by actually measuring notification timing against known server-side event intervals** (four notifications at roughly 500ms apart here, matching the server's own `setTimeout` loop) - this confirms genuine push delivery, not a client secretly falling back to polling underneath an API that looks like a subscription.

## Why This Matters in Production

Finding a genuine ecosystem capability difference between two supposedly-equivalent implementations of the same protocol is exactly the kind of finding that saves real time on a future decision - if a live-updating feature needs true server push rather than client polling, this session's evidence says build it in TypeScript against this library version, not Python's `fastmcp` as currently installed.
