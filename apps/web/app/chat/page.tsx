"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { EsihLogo } from "@/components/esih-logo";

// A simple top bar that sits above the chat thread — the ESIH logo and
// project name on the left, and who's using it on the right. This is what
// makes the page read as a real, owned product instead of an anonymous
// chat widget.
function ChatHeader() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex items-center gap-3">
        <EsihLogo size={36} />
        <div>
          <p className="font-semibold leading-tight">Sovereign Intelligence Hub</p>
          <p className="text-xs text-muted-foreground">AI Agent Stream</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium leading-tight">Demo reviewer</p>
        <p className="text-xs text-muted-foreground">Fictional data only</p>
      </div>
    </header>
  );
}

// This is the web page a visitor actually sees and types into. Rather than
// hand-rolling the message list, input box, and streaming state ourselves
// (as the earlier version of this page did), useChatRuntime plus assistant-ui's
// ready-made Thread component gives us a production-grade chat UI for free:
// markdown rendering, auto-scroll, retry buttons, and proper styling included.
export default function EnterpriseChatUI() {
  const runtime = useChatRuntime({
    // Some tool calls can complete instantly on the browser side (frontend
    // tools). This setting lets the conversation continue automatically once
    // that happens, instead of waiting for the visitor to send another message.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <ChatHeader />
        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
