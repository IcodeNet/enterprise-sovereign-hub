import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { FastMCP } from "fastmcp";
import { z } from "zod";

/**
 * FastMCP dynamic resource + real push subscription - Day 32 TS port.
 *
 * REAL ECOSYSTEM FINDING, the opposite direction from usual: the Python
 * fastmcp package (4.0.10) has NO resource-subscription/push mechanism at
 * all - confirmed on the Python side by inspecting `dir(Client)` directly,
 * which contains no subscribe/notify method. The TypeScript `fastmcp`
 * package (4.22.0) genuinely DOES support this - `sendResourceUpdated()`
 * on the server and `subscribeResource()` + a `ResourceUpdatedNotification`
 * handler on the client, both confirmed by inspecting the SDK's own type
 * definitions before writing this code. This lesson uses the real push
 * mechanism because it genuinely exists here, unlike the Python side.
 */

const InfraHealthEventSchema = z.object({
  timestamp: z.string(),
  serviceName: z.string(),
  cpuUtilizationPct: z.number(),
  status: z.enum(["HEALTHY", "DEGRADED", "CRITICAL"]),
});

const RESOURCE_URI = "system://metrics/live";
const PORT = 8931;

// Real, mutable server-side data source, same as the Python side - each
// read (and each push notification) reflects the current value here.
const sampleMetrics = [35.0, 68.0, 92.4, 45.1];
let metricsIndex = 0;

function buildCurrentEvent() {
  const cpu = sampleMetrics[metricsIndex % sampleMetrics.length];
  metricsIndex += 1;
  return InfraHealthEventSchema.parse({
    timestamp: new Date().toISOString(),
    serviceName: "sovereign-ai-engine",
    cpuUtilizationPct: cpu,
    status: cpu >= 90.0 ? "DEGRADED" : "HEALTHY",
  });
}

function buildServer(): FastMCP {
  const server = new FastMCP({ name: "SovereignStreamingHub", version: "1.0.0" });

  server.addResource({
    uri: RESOURCE_URI,
    name: "Live Infrastructure Metrics",
    mimeType: "application/json",
    async load() {
      return { text: JSON.stringify(buildCurrentEvent()) };
    },
  });

  return server;
}

async function runMcpSubscriptionListener(): Promise<void> {
  console.log(`Step 1: Starting a real FastMCP server on http://localhost:${PORT}...`);
  const server = buildServer();
  await server.start({ transportType: "httpStream", httpStream: { port: PORT } });

  console.log("Step 2: Connecting a real MCP Client and subscribing to the resource...\n");
  const client = new Client({ name: "sovereign-hub-listener", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
  await client.connect(transport);

  let updatesReceived = 0;
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification) => {
    updatesReceived += 1;
    const result = await client.readResource({ uri: notification.params.uri });
    const content = result.contents[0];
    if (!content || !("text" in content))
      throw new Error("Expected a text resource, got binary content.");
    const rawText = content.text;

    const event = InfraHealthEventSchema.parse(JSON.parse(rawText));
    console.log(`[${event.timestamp}] Push Notification #${updatesReceived} Received:`);
    console.log(
      ` Service: ${event.serviceName} | CPU: ${event.cpuUtilizationPct}% | Status: ${event.status}`,
    );
    if (event.status === "DEGRADED") {
      console.log(` >>> ALERT: Auto-scaling trigger dispatched for ${event.serviceName}!`);
    }
    console.log("-".repeat(50));
  });

  await client.subscribeResource({ uri: RESOURCE_URI });

  // Simulate the metric changing over time by pushing a real
  // sendResourceUpdated() notification from the server for each sample -
  // a genuine server-initiated push, not a client poll loop.
  const serverSession = server.sessions[0];
  for (let i = 0; i < sampleMetrics.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await serverSession?.sendResourceUpdated(RESOURCE_URI);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log(`\nTotal real push notifications received: ${updatesReceived}`);

  await client.close();
  await server.stop();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpSubscriptionListener().catch(console.error);
}
