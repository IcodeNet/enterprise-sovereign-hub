This is Day 3 of our **Enterprise Sovereign Intelligence Hub** build: making the AI's answer show up on screen as it's being written, instead of the visitor staring at a blank page until the whole thing is ready.

---

## Vercel AI SDK — Day 3: A Live-Typing Chat Page

### The Problem We're Solving

Days 1 and 2 waited for the AI to finish its entire answer before showing anything. That's fine for a background script printing to a terminal, but on a real web page it feels broken — the visitor sees nothing happen for several seconds, then the whole answer appears all at once. Long answers make this worse: a slow, silent wait, then a wall of text.

What we actually want is what ChatGPT's own website does: the answer appears piece by piece, as the AI writes it, so the page feels alive and responsive from the first word. Building that ourselves from scratch would mean handling a live network connection, breaking the AI's output into pieces as they arrive, and updating the page's screen every time a new piece comes in — a lot of fiddly, easy-to-get-wrong plumbing for something that should just work.

Focus: streaming an AI's answer to a real web page, piece by piece, as it's written
Time investment: 15 minutes

The Vercel AI SDK removes that plumbing entirely. On the server side, `streamText()` opens a live connection to the AI and hands back its answer as a stream of pieces instead of one final block. On the browser side, a ready-made helper called `useChat` receives that stream, keeps track of the whole conversation, and updates the page automatically as each new piece arrives — we don't write any of that ourselves.

### Step 1: Create the Server-Side Route

This lesson needs a real website structure (a page plus a server endpoint it talks to), not just a script — so `apps/web` now includes a small Next.js website. Create the file that receives a chat message and streams back the AI's reply:

`apps/web/app/api/chat/route.ts`

### Step 2: Add the Streaming Endpoint

```typescript
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";

// Lets a single request take up to 30 seconds — a streamed AI answer can take
// longer than a normal quick API call, so we raise the usual short timeout.
export const maxDuration = 30;

// Handles a chat message from the web page: sends it to the AI and streams the
// reply back piece by piece, instead of making the visitor wait for the whole
// answer to finish before seeing anything.
export async function POST(req: Request) {
  const { messages } = await req.json();

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
    system:
      "We are an enterprise AI assistant for the Sovereign Intelligence Hub. " +
      "We provide concise, highly technical responses for software engineering teams.",
    messages: modelMessages,
  });

  // Converts that live connection into the exact response shape the web page's
  // chat hook (see page.tsx) knows how to read piece by piece as it arrives.
  return result.toUIMessageStreamResponse();
}
```

### Step 3: Build the Chat Page Itself

Create the actual page a visitor sees and types into:

`apps/web/app/chat/page.tsx`

```typescript
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

// This is the web page a visitor actually sees and types into. useChat is a
// helper that keeps track of the conversation and talks to our route.ts API
// above automatically — we don't write any manual network or streaming code
// ourselves, it's all handled for us.
export default function EnterpriseChatUI() {
  // The text currently typed into the input box, kept in this component's own
  // memory since useChat itself doesn't track the not-yet-sent draft text.
  const [input, setInput] = useState("");

  // messages is the whole conversation so far. sendMessage sends a new one.
  // status tells us whether the AI is currently mid-reply ("streaming"), so we
  // can show a "typing" indicator instead of leaving the page looking frozen.
  const { messages, sendMessage, status } = useChat();

  const isLoading = status === "streaming" || status === "submitted";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Sovereign Hub — AI Agent Stream</h1>

      <div className="space-y-4 mb-6 border p-4 rounded-lg bg-gray-50 min-h-[300px]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-md ${message.role === "user" ? "bg-blue-100 text-right" : "bg-white border"}`}
          >
            <span className="font-semibold block text-xs text-gray-500 mb-1">
              {message.role === "user" ? "Byron (Lead Architect)" : "AI System"}
            </span>
            {/* A message arrives as a list of "parts" rather than one flat string —
                a live streamed reply is built up piece by piece, so we join whichever
                parts are plain text as they arrive. */}
            <p className="whitespace-pre-wrap">
              {message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")}
            </p>
          </div>
        ))}
        {isLoading && (
          <p className="text-sm text-gray-400 animate-pulse">Streaming response from hub...</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask our AI agent about system architecture..."
          className="flex-1 border p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

*(Note: a website built this way needs one more small file, `app/layout.tsx`, that wraps every page in the shared page structure Next.js expects — it's already in the repo alongside this one.)*

### Step 4: Set Up and Run It

From `apps/web`:

```bash
npm install next react react-dom @ai-sdk/react
npm install --save-dev @types/react @types/react-dom
npm run dev
```

Then open `http://localhost:3000/chat` in a browser and type a question.

*(Note: while building this lesson, `streamText`'s `messages` option turned out to need a step this SDK version didn't do automatically: the web page sends messages in one format (split into "parts"), but the AI call expects a plainer format, and the conversion function that bridges them (`convertToModelMessages`) is asynchronous in this version — calling it without `await` silently returns an unusable, not-yet-finished promise instead of the actual converted messages, and the real error only surfaces once `streamText` tries to use it. If your streamed chat immediately errors with something like "messages.some is not a function," check that you're awaiting that conversion step.)*

---

## Best Practices

- **Let the SDK's `useChat` own the connection and message state — don't hand-roll your own network/streaming code.** It already handles the live connection, breaking the answer into pieces, and re-rendering the page as each piece arrives.
- **Always convert between the web page's message format and the AI call's message format, and remember to wait for that conversion.** A skipped or un-awaited conversion step fails in a way that looks like it's the AI call's fault, when the real mistake is one step earlier.
- **Show a clear "the AI is thinking" state on screen instead of leaving the page looking frozen.** The `status` value from `useChat` tells you exactly when a reply is in progress, so there's no reason for a user to be left guessing whether anything is happening.
- **Test the streaming endpoint directly (e.g. with `curl`) before blaming the web page for a broken chat.** It's a much faster way to see the AI's real streamed pieces (or a real error message) than clicking through a UI that might be swallowing the actual problem.

## Why This Matters in Production

This gives our web-facing product the same feel as the AI chat tools our users already expect — an answer that appears as it's written, not a long silent wait followed by a wall of text. And because the AI model is a single line of setup (`openai("gpt-4o")`), swapping to a different AI provider later, if we ever need to, doesn't mean rebuilding any of this streaming or page logic — just changing that one line.
