import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type JSONSchema7,
  type UIMessage,
} from "ai";
import { fetchLiveSkillCount } from "@/src/agents/skill-demand-tool";

// Lets a single request take up to 30 seconds — a streamed AI answer can take
// longer than a normal quick API call, so we raise the usual short timeout.
export const maxDuration = 30;

// Handles a chat message from the web page: sends it to the AI and streams the
// reply back piece by piece, instead of making the visitor wait for the whole
// answer to finish before seeing anything. This route is shared by assistant-ui's
// Thread component, which is why it also accepts an optional system prompt and
// frontend-defined tools from the request body instead of hardcoding them here.
export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  // The web page sends its own UI-friendly message format (each message split
  // into "parts"). The AI model needs a plainer format instead, so we convert
  // between the two before making the actual call.
  const modelMessages = await convertToModelMessages(messages);

  // Starts the AI call. Unlike Day 1 and Day 2, this doesn't wait for a full
  // reply — it opens a live connection and hands back pieces of the answer
  // as the AI writes them, the same way ChatGPT's own interface types out
  // its answer live instead of showing it all at once.
  const result = streamText({
    model: openai("gpt-4o"),
    messages: modelMessages,
    // frontendTools lets assistant-ui's Thread component define tools the
    // browser itself can run (e.g. "copy this to the clipboard"). fetchLiveSkillCount
    // is Day 2 (TS Port)'s real backend tool, now wired into the live chat app itself
    // instead of only running inside the standalone trend-tool-agent.ts script.
    tools: { ...frontendTools(tools ?? {}), fetchLiveSkillCount },
    // Lets the model take more than one step: one to call fetchLiveSkillCount,
    // one more to write its final answer using what the tool returned.
    stopWhen: stepCountIs(3),
    system:
      system ??
      "We are an enterprise AI assistant for the Sovereign Intelligence Hub. " +
        "We provide concise, highly technical responses for software engineering teams. " +
        "Use the fetchLiveSkillCount tool to check real job-posting demand before making a skill recommendation.",
  });

  // Converts that live connection into the exact response shape assistant-ui's
  // Thread component (see app/chat/page.tsx) knows how to read piece by piece
  // as it arrives, including markdown, reasoning, and tool-call rendering.
  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
