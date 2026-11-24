import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Hierarchical memory compaction for long agent conversations - Day 42 TS port.
 *
 * Compacts older turns into a structured digest once a threshold is
 * reached, while keeping the most recent turns verbatim.
 */

const CompactedMemorySummarySchema = z.object({
  keyDecisions: z.array(z.string()).describe("Architecture choices or commitments made."),
  activeConstraints: z
    .array(z.string())
    .describe("Active technical constraints (e.g. framework, ports, DB)."),
  condensedNarrative: z.string().describe("Ultra-concise summary of historical discussion."),
});

interface ChatTurn {
  role: string;
  content: string;
}

class CompactableSessionMemory {
  history: ChatTurn[] = [];
  activeSummary = "Initial session state.";

  constructor(private compactionThreshold = 6) {}

  addMessage(role: string, content: string): void {
    this.history.push({ role, content });
  }

  async getEffectivePromptContext(): Promise<string> {
    if (this.history.length >= this.compactionThreshold) {
      console.log(
        `\n[COMPACTION TRIGGERED] Turn count (${this.history.length}) reached threshold (${this.compactionThreshold}).`,
      );

      // Compact older turns, preserve the last 2 turns verbatim so active
      // intent is never lost even as history compresses.
      const turnsToCompact = this.history.slice(0, -2);
      const recentTurns = this.history.slice(-2);

      const rawText = turnsToCompact.map((t) => `${t.role}: ${t.content}`).join("\n");

      const { object: data } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: CompactedMemorySummarySchema,
        system:
          "We are a principal systems context engineer. Summarize conversation history into structured key " +
          "decisions, constraints, and an ultra-dense narrative. Discard conversational filler.",
        prompt: `Previous Context Digest: ${this.activeSummary}\n\nNew Messages to Compact:\n${rawText}`,
      });

      this.activeSummary =
        `Narrative: ${data.condensedNarrative} | ` +
        `Decisions: ${data.keyDecisions.join("; ")} | ` +
        `Constraints: ${data.activeConstraints.join("; ")}`;
      this.history = recentTurns;
      console.log(` [COMPACTED CONTEXT] New digest length: ${this.activeSummary.length} chars`);
    }

    const recentContext = this.history.map((t) => `${t.role}: ${t.content}`).join("\n");
    return `=== HISTORICAL DIGEST ===\n${this.activeSummary}\n\n=== RECENT DIALOGUE ===\n${recentContext}`;
  }
}

async function main(): Promise<void> {
  const session = new CompactableSessionMemory(4);

  const turns: [string, string][] = [
    ["user", "We are building the Sovereign Intelligence Hub on cloud container infrastructure."],
    ["assistant", "Configured the deployment scripts for container orchestration."],
    ["user", "We decided to enforce Pydantic AI for type safety and FastMCP for tools."],
    ["assistant", "Updated schemas to enforce BaseModel output validation."],
    ["user", "Ensure all database connections go to Qdrant on port 6333."],
    ["assistant", "Configured Qdrant hybrid retrieval client on port 6333."],
  ];

  for (const [role, text] of turns) {
    session.addMessage(role, text);
  }

  const effectiveContext = await session.getEffectivePromptContext();
  console.log("\n=== Effective Context Injected into Next LLM Call ===");
  console.log(effectiveContext);

  const rawCharCount = turns.reduce((sum, [, text]) => sum + text.length, 0);
  const compactedCharCount =
    session.activeSummary.length + session.history.reduce((sum, t) => sum + t.content.length, 0);
  console.log(
    `\nRaw history turns: ${turns.length} | Post-compaction turns kept verbatim: ${session.history.length}`,
  );
  console.log(
    `Raw content chars: ${rawCharCount} | Compacted content chars: ${compactedCharCount}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
