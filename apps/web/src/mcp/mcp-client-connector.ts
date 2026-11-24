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
  discoveredTools: z
    .array(z.string())
    .describe("Names of tools discovered dynamically from the MCP server."),
  executionResult: z.string().describe("Result generated after calling the discovered MCP tool."),
});

async function runMcpClientWorkflow(userQuery: string) {
  console.log("Step 1: Connecting to Day 6's real FastMCP server as a subprocess over stdio...");

  // StdioClientTransport launches the target script as a REAL child
  // process (via tsx, since the server is a .ts file) and speaks the
  // actual MCP JSON-RPC protocol over its stdio - a genuine
  // client/server connection, not a hardcoded tool list standing in for
  // one. listTools() asks the SERVER what it exposes; nothing about the
  // available tools is assumed here.
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

    console.log(
      `\nStep 2: Calling the real 'analyze_skill_demand' tool for query: '${userQuery}'...`,
    );
    // A real MCP tool call over the wire - FastMCP validates our
    // arguments against the SAME Zod schema Day 6's server defined, on
    // the server's own process, not locally.
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
