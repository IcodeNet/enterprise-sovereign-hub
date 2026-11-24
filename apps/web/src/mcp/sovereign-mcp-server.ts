import { FastMCP } from "fastmcp";
import { z } from "zod";

// Instantiates the server: this object is what turns our plain TypeScript
// functions below into something any MCP-aware AI client (Claude Desktop,
// Cursor, our own Sovereign Intelligence Hub) can discover and call, without
// us writing any custom integration glue for each client.
const server = new FastMCP({
  name: "Sovereign Intelligence Hub MCP Server",
  version: "1.0.0",
});

// A high-demand check, same list as the Python lesson - kept as a plain
// function so both the tool and any future caller can reuse the same logic.
function isHighDemandSkill(skillName: string): boolean {
  const target = skillName.toLowerCase().trim();
  const highDemandStack = ["pydantic ai", "fastmcp", "vercel ai sdk", "llamaindex", "langgraph"];
  return highDemandStack.some((tech) => target.includes(tech));
}

// server.addTool turns a plain function into something an AI client can
// call by name, with FastMCP handling the request/response translation.
// The Zod schema (parameters) is what generates the tool's input schema
// automatically - we never hand-write any JSON schema ourselves.
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
      recommendedAction: isPriority
        ? "Generate daily 15-min tutorial"
        : "Add to backlog for later review",
      targetSeniority: experienceLevel,
    });
  },
});

// server.addResource exposes read-only data at a named address (a URI), the
// same way a website exposes a page at a URL.
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

// A DYNAMIC resource template: the {category} placeholder in uriTemplate
// means this one definition answers for many different addresses
// (resource://skills/agents, resource://skills/rag, etc.) instead of us
// writing one fixed resource per category.
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

// Starts the server over STDIO (standard input/output) - the same channel
// an IDE extension or desktop AI client talks over when it runs our server
// as a local subprocess, rather than connecting to it as a network address.
server.start({
  transportType: "stdio",
});
