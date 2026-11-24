import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

/**
 * Semantic guardrails intercepting FastMCP-style tool payloads - Day 44 TS port.
 *
 * Static type checking on a tool's arguments doesn't catch a semantic
 * exploit - a SQL injection pattern or an unauthorized table name is still
 * a syntactically valid string. This intercepts the actual argument
 * payload with a Zod schema carrying real security rules, before the
 * tool's real logic ever runs.
 */

const ALLOWED_TABLES = new Set(["market_trends", "skills_inventory", "agent_logs"]);
const DANGEROUS_PATTERNS = [
  /--/,
  /;/,
  /\/\*/,
  /\*\//,
  /@@/,
  /char\s*\(/i,
  /drop\s+/i,
  /delete\s+/i,
];

const DatabaseQueryPayloadSchema = z.object({
  tableName: z
    .string()
    .describe("Target database table name.")
    .transform((v) => v.toLowerCase().trim())
    .refine((v) => ALLOWED_TABLES.has(v), {
      message: "Unauthorized table access. Permitted tables only.",
    }),
  filterColumn: z.string().describe("Column to filter by."),
  filterValue: z
    .string()
    .describe("Exact value to query.")
    .transform((v) => v.trim())
    .refine((v) => !DANGEROUS_PATTERNS.some((pattern) => pattern.test(v)), {
      message: "Semantic security violation detected in query argument.",
    }),
  limit: z.number().int().max(100).default(10).describe("Max rows to return, capped at 100."),
});

async function internalQueryDatabase(
  payload: z.infer<typeof DatabaseQueryPayloadSchema>,
): Promise<string> {
  // Safe execution point after all semantic checks pass.
  return (
    `QUERY SUCCESS: Retrieved ${payload.limit} records from '${payload.tableName}' ` +
    `where ${payload.filterColumn} = '${payload.filterValue}'.`
  );
}

const querySecureDatabase = tool({
  description: "Executes a filtered select query on approved internal tables.",
  inputSchema: z.object({
    tableName: z.string(),
    filterColumn: z.string(),
    filterValue: z.string(),
    limit: z.number().int().default(10),
  }),
  execute: async ({ tableName, filterColumn, filterValue, limit }) => {
    // Intercept and validate arguments against the semantic guardrail
    // schema BEFORE any real query logic runs.
    const parsed = DatabaseQueryPayloadSchema.safeParse({
      tableName,
      filterColumn,
      filterValue,
      limit,
    });
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join("; ");
      console.log(` [GUARD INTERCEPTION] Tool execution blocked: ${message}`);
      return `TOOL_CALL_REJECTED: ${message}`;
    }

    console.log(
      ` [GUARD PASSED] Tool call cleared. Executing query on '${parsed.data.tableName}'...`,
    );
    return internalQueryDatabase(parsed.data);
  },
});

async function runQuery(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "We are an enterprise AI database agent. Use the guarded database query tool to search records cleanly and securely.",
    tools: { querySecureDatabase },
    stopWhen: stepCountIs(3),
    prompt,
  });
  return text;
}

async function main(): Promise<void> {
  console.log("--- Test 1: Valid Authorized Query ---");
  const res1 = await runQuery(
    "Look up the latest 5 market trends in table 'market_trends' where skill is 'Pydantic AI'.",
  );
  console.log(`Agent Output: ${res1}\n`);

  console.log("--- Test 2: Adversarial SQL Injection Attempt ---");
  const res2 = await runQuery(
    "Query table 'market_trends' with filter_column 'skill' and filter_value 'test; DROP TABLE market_trends--'.",
  );
  console.log(`Agent Output: ${res2}\n`);

  console.log("--- Test 3: Unauthorized Sensitive Table Access ---");
  const res3 = await runQuery(
    "Look up user credentials from table 'customer_passwords' where username is 'admin'.",
  );
  console.log(`Agent Output: ${res3}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
