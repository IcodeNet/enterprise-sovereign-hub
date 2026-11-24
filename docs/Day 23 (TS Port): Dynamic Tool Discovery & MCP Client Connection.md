This is Day 23's TypeScript side - the same real client/server connection, using the official `@modelcontextprotocol/sdk` (the actual protocol reference implementation) rather than FastMCP's own convenience client, to prove interoperability across two different MCP client libraries against the same real server.

---

## MCP Client — Day 23 (TS Port): Dynamic Tool Discovery & MCP Client Connection

### The Problem We're Solving

Same problem as the Python lesson: connect a real client to a real MCP server and discover its tools dynamically, rather than faking discovery with a hardcoded list.

**A deliberate choice here worth calling out**: this port uses `@modelcontextprotocol/sdk`'s own `Client`/`StdioClientTransport` - the official protocol reference implementation - rather than reaching for `fastmcp`'s convenience client (the same library Day 6's TS server used to expose its tools). Connecting with a DIFFERENT library than the one that built the server is a stronger interoperability proof than using the same library on both ends: it confirms the server genuinely speaks standard MCP, not just "talks to its own client."

Focus: a genuine MCP client, using the official reference SDK, connecting to Day 6's real TypeScript server
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the MCP client and its server connection (`Client(SERVER_SCRIPT_PATH)` from `fastmcp`) | the MCP client and its server connection (`new Client({...})` + `new StdioClientTransport({ command: "npx", args: ["tsx", SERVER_SCRIPT_PATH] })`) |
| opening and closing the connection (`async with Client(...) as client:`) | opening and closing the connection (`await client.connect(transport)` ... `finally { await client.close() }`) |
| discovering the server's tools (`await client.list_tools()`) | discovering the server's tools (`const { tools } = await client.listTools()`) |
| calling a discovered tool (`await client.call_tool("analyze_skill_demand", {"query": {"skill_name": ..., "experience_level": "Senior"}})`) | calling a discovered tool (`await client.callTool({ name: "analyze_skill_demand", arguments: { skillName: ..., experienceLevel: "Senior" } })`) |
| reading the raw tool result (`tool_result.data`) | reading the raw tool result (`toolResult.content`) |
| the checked summary (`class MCPExecutionSummary(BaseModel)`, via `await mcp_client_agent.run(synthesis_prompt)`) | the checked summary (`MCPExecutionSummarySchema`, via `const { object: summary } = await generateObject({...})`) |

### Step 1: No New Dependencies

This lesson uses `@modelcontextprotocol/sdk`, already installed from Day 6.

### Step 2: Create the Source File

Inside `apps/web/src/mcp/`, create:
`mcp-client-connector.ts`

### Step 3: Add the Source Code

```typescript
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

// eslint-disable-next-line no-underscore-dangle -- Node's own import.meta.url-derived dirname convention
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT_PATH = path.join(__dirname, "sovereign-mcp-server.ts");

const MCPExecutionSummarySchema = z.object({
  query: z.string(),
  discoveredTools: z.array(z.string()).describe("Names of tools discovered dynamically from the MCP server."),
  executionResult: z.string().describe("Result generated after calling the discovered MCP tool."),
});

async function runMcpClientWorkflow(userQuery: string) {
  console.log("Step 1: Connecting to Day 6's real FastMCP server as a subprocess over stdio...");

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", SERVER_SCRIPT_PATH],
  });
  const client = new Client({ name: "sovereign-hub-mcp-test-client", version: "1.0.0" });

  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const discovered = tools.map((tool) => tool.name);
    console.log(`Discovered Tools (from real server introspection): ${JSON.stringify(discovered)}`);

    console.log(`\nStep 2: Calling the real 'analyze_skill_demand' tool for query: '${userQuery}'...`);
    const toolResult = await client.callTool({
      name: "analyze_skill_demand",
      arguments: { skillName: userQuery, experienceLevel: "Senior" },
    });
    const rawResult = toolResult.content;
    console.log(`Raw MCP Tool Result: ${JSON.stringify(rawResult)}`);

    console.log("\nStep 3: Executing Agent reasoning loop over the real tool result...");
    const synthesisPrompt =
      `User Query: ${userQuery}\n` +
      `Available MCP Tools (from real server discovery): ${JSON.stringify(discovered)}\n` +
      `Tool Result: ${JSON.stringify(rawResult)}`;

    const { object: summary } = await generateObject({
      model: openai("gpt-4o"),
      schema: MCPExecutionSummarySchema,
      system:
        "We are an enterprise AI agent connected to external MCP servers. " +
        "Use the tools provided dynamically by the MCP server to answer user inquiries.",
      prompt: synthesisPrompt,
    });
    summary.discoveredTools = discovered;

    console.log("\n--- MCP Client Execution Result ---");
    console.log(`Query: ${summary.query}`);
    console.log(`Tools Discovered: ${JSON.stringify(summary.discoveredTools)}`);
    console.log(`Execution Summary: ${summary.executionResult}`);

    return summary;
  } finally {
    await client.close();
  }
}

const query = "pydantic ai";
runMcpClientWorkflow(query).catch(console.error);
```

### Step 4: Run and Verify - Cross-Library Interoperability Proven

```bash
cd apps/web
npx tsx src/mcp/mcp-client-connector.ts
```

A real run: `Discovered Tools (from real server introspection): ["analyze_skill_demand"]` - the SAME tool Day 6's server exposes, discovered here by a COMPLETELY DIFFERENT client library (`@modelcontextprotocol/sdk`) than the one used to build the server (`fastmcp`). The subsequent real tool call returns the server's genuine computed result: `{"skill":"pydantic ai","priorityLevel":"CRITICAL",...}`, matching the Python lesson's equivalent result exactly.

---

## Best Practices

- **Connecting with a DIFFERENT client library than the one that built the server is a stronger interoperability proof than matching libraries on both ends.** It confirms the server speaks the actual standard protocol, not just "works with its own client" - the same kind of cross-check this repo already applied when Day 6 verified its TS server with both `fastmcp validate` AND a real `@modelcontextprotocol/sdk` client.
- **`StdioClientTransport`'s `command`/`args` genuinely launch a separate OS process** - here, `npx tsx <server-file>` - the same real subprocess boundary as the Python lesson's `Client(Path)`, not an in-process function call dressed up to look like one.
- **Always `client.close()` in a `finally` block** - leaving the subprocess connection open on an error path would leak a lingering child process.

## Why This Matters in Production

Proving a server against a DIFFERENT client implementation than the one used to build it is real evidence of standards compliance, not just internal consistency. A server that only ever gets tested against its own matching client library could pass every internal test while still being subtly incompatible with a genuinely external MCP client (Claude Desktop, Cursor, or any other tool) - this cross-library test is what actually rules that out.
