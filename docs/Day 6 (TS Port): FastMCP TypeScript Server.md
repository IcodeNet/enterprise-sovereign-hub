This is Day 6's TypeScript side: the same MCP server as the Python lesson, using the real TypeScript `fastmcp` package instead of Python's.

---

## FastMCP (TypeScript) — Day 6 (TS Port): MCP Server Architecture

### The Problem We're Solving

Same problem as the Python lesson: without a shared standard, every AI client needs its own custom integration code to use one of our tools. MCP (Model Context Protocol) fixes this once, regardless of which language the server or the client happens to be written in - a TypeScript MCP server and a Python MCP server look identical to any MCP-aware client.

TypeScript's `fastmcp` package (not to be confused with the older, legacy-protocol `punkpeye/fastmcp`, which the search for this lesson turned up first) is the real sibling of Python's FastMCP - same idea of turning plain functions into MCP tools and resources with minimal boilerplate.

Focus: the same typed tool, static resource, and dynamic resource template, built with TypeScript's `fastmcp`
Time investment: 15 minutes (assuming Day 6's Python lesson already explained the *why*)

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| creating the server (`mcp = FastMCP(name="Sovereign Intelligence Hub MCP Server")`) | creating the server (`const server = new FastMCP({ name: "Sovereign Intelligence Hub MCP Server", version: "1.0.0" })`) |
| the tool's input shape (`class SkillQueryInput(BaseModel)`) | the tool's input shape (`parameters: z.object({ skillName, experienceLevel })`) |
| registering the tool (`@mcp.tool(name="analyze_skill_demand", ...)`) | registering the tool (`server.addTool({ name: "analyze_skill_demand", ..., execute })`) |
| a static resource (`@mcp.resource("resource://hub/status")`) | a static resource (`server.addResource({ uri: "resource://hub/status", load })`) |
| a dynamic resource template (`@mcp.resource("resource://skills/{category}")`) | a dynamic resource template (`server.addResourceTemplate({ uriTemplate: "resource://skills/{category}", arguments: [...] })`) |
| starting it (`mcp.run()`) | starting it (`server.start({ transportType: "stdio" })`) |

### Step 1: Install the Packages

Inside `apps/web`:

```bash
npm install fastmcp zod --legacy-peer-deps
```

### Step 2: Create the Source File

Inside `apps/web/src/mcp/`, create:
`sovereign-mcp-server.ts`

### Step 3: Add the Source Code

```typescript
import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "Sovereign Intelligence Hub MCP Server",
  version: "1.0.0",
});

function isHighDemandSkill(skillName: string): boolean {
  const target = skillName.toLowerCase().trim();
  const highDemandStack = ["pydantic ai", "fastmcp", "vercel ai sdk", "llamaindex", "langgraph"];
  return highDemandStack.some((tech) => target.includes(tech));
}

server.addTool({
  name: "analyze_skill_demand",
  description: "Evaluates job market frequency and architecture fit for a skill.",
  parameters: z.object({
    skillName: z.string().describe("The engineering tool or library to query."),
    experienceLevel: z.string().default("Senior").describe("Developer target seniority level."),
  }),
  execute: async ({ skillName, experienceLevel }) => {
    const isPriority = isHighDemandSkill(skillName);

    return JSON.stringify({
      skill: skillName,
      priorityLevel: isPriority ? "CRITICAL" : "STANDARD",
      recommendedAction: isPriority ? "Generate daily 15-min tutorial" : "Add to backlog for later review",
      targetSeniority: experienceLevel,
    });
  },
});

server.addResource({
  uri: "resource://hub/status",
  name: "Hub Status",
  mimeType: "application/json",
  load: async () => ({
    text: JSON.stringify({
      status: "HEALTHY",
      activeModules: ["Pydantic AI", "Vercel AI SDK", "LlamaIndex", "LangGraph", "FastMCP"],
      pipelineFrequency: "DAILY_0700_UTC",
    }),
  }),
});

server.addResourceTemplate({
  uriTemplate: "resource://skills/{category}",
  name: "Skills by Category",
  mimeType: "application/json",
  arguments: [{ name: "category", description: "The architectural domain to list skills for." }],
  load: async ({ category }) => {
    const domainMap: Record<string, string[]> = {
      agents: ["Pydantic AI", "LangGraph", "AutoGPT"],
      rag: ["LlamaIndex", "Azure AI Search", "Pinecone"],
      protocols: ["FastMCP", "OpenTelemetry", "REST"],
    };
    const skills = domainMap[category.toLowerCase()] ?? ["Python", "TypeScript"];
    return { text: JSON.stringify(skills) };
  },
});

server.start({
  transportType: "stdio",
});
```

### Step 4: Verify the Server Actually Works

Same as Python: an MCP server just sits there waiting for a real client, so running the file alone doesn't prove anything. First check its shape with the CLI (no client needed):

```bash
npx fastmcp validate src/mcp/sovereign-mcp-server.ts
```

Then connect an actual MCP client to it as a real subprocess over stdio, using the official `@modelcontextprotocol/sdk`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/mcp/sovereign-mcp-server.ts"],
});

const client = new Client({ name: "verify-client", version: "1.0.0" });
await client.connect(transport);

const toolResult = await client.callTool({
  name: "analyze_skill_demand",
  arguments: { skillName: "FastMCP", experienceLevel: "Senior" },
});
console.log(toolResult.content);
```

You should see the same `priorityLevel: "CRITICAL"` result as the Python version - a real client, over a real stdio connection, calling the real tool.

*(Note: TypeScript's `fastmcp` doesn't ship the same `fastmcp call <tool>` one-shot CLI command Python's version has - only `dev`, `inspect`, and `validate`. Connecting a real client via `@modelcontextprotocol/sdk` is the equivalent depth of verification, just done in code instead of from a single CLI command.)*

---

## Best Practices

- **Two packages can share almost the same name and do very different things - check which protocol version before adopting one.** The older `punkpeye/fastmcp` package only supports the legacy (2025-and-earlier) MCP handshake, not the current spec; the real sibling of Python's FastMCP is the newer `fastmcp` package used here.
- **A resource template's placeholder argument list has to match its `uriTemplate` exactly.** `{category}` in the URI and `arguments: [{ name: "category" }]` are two separate declarations that both have to agree, unlike Python's version where the function's parameter name alone does double duty.
- **`fastmcp validate` catches structural mistakes before you ever try to connect a real client.** It's a fast first check (TypeScript compiles, the file is a valid FastMCP server) worth running before the slower, more thorough step of actually spinning up a client connection.

## Why This Matters in Production

The same tool and resources built in Day 6's Python lesson now also exist as a TypeScript MCP server, callable by any MCP-aware client regardless of which language wrote the server. Whichever side of our stack ends up hosting a given tool, the protocol underneath is identical - a client doesn't need to know or care whether it's talking to Python or TypeScript on the other end.
