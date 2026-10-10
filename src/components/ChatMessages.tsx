"use client";

import { useState, useRef, useEffect } from "react";
import { User, Sparkles, Copy, Check, Link2 } from "lucide-react";
import { STATUS_LABELS, type Source } from "@/lib/sse";

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  english?: string; // English version, sent back to the backend as conversation context
  sources?: Source[];
  error?: boolean;
};

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  status?: string | null;
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ChatMessages({ messages, isLoading, status }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, status]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000); // Reset after 2 seconds
  };

  // Filter out system messages so they don't show on screen
  const visibleMessages = messages.filter((m) => m.role !== "system");
  const statusLabel = status ? STATUS_LABELS[status] ?? "Working…" : "Working…";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
      {visibleMessages.map((msg, index) => {
        const isUser = msg.role === "user";
        const isLastMessage = index === visibleMessages.length - 1;
        const isStreaming = !isUser && isLastMessage && isLoading;

        return (
          <div
            key={index}
            className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {isUser ? (
                <User className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sparkles className="w-5 h-5 text-emerald-500" />
              )}
              <span className="text-sm font-medium text-muted-foreground">
                {isUser ? "You" : "Assistant"}
              </span>
            </div>

            <div
              className={`max-w-[85%] px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${isUser
                  ? "bg-foreground text-background rounded-tr-sm"
                  : msg.error
                    ? "bg-card border border-red-500/40 text-card-foreground rounded-tl-sm"
                    : "bg-card border border-border text-card-foreground rounded-tl-sm"
                }`}
            >
              {/* Message Content */}
              {msg.content ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : isStreaming ? (
                <span className="text-sm text-muted-foreground animate-pulse">{statusLabel}</span>
              ) : null}

              {/* Blinking Cursor if streaming this specific message */}
              {isStreaming && msg.content && (
                <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse" />
              )}
            </div>

            {/* Status while the rest of the answer is still being translated */}
            {isStreaming && msg.content && status && (
              <span className="mt-1 ml-2 text-xs text-muted-foreground">{statusLabel}</span>
            )}

            {/* Sources */}
            {!isUser && msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 ml-2 flex flex-col gap-1 max-w-[85%]">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="w-3.5 h-3.5" /> Sources
                </span>
                {msg.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs text-blue-400 hover:underline truncate"
                    title={source.url}
                  >
                    [{source.id}] {source.title || hostname(source.url)}
                    <span className="text-muted-foreground"> · {hostname(source.url)}</span>
                  </a>
                ))}
              </div>
            )}

            {/* ACTION BAR: Copy Button & Done Indicator */}
            {!isUser && msg.content && (
              <div className="flex items-center gap-3 mt-2 ml-2">
                <button
                  onClick={() => handleCopy(msg.content, index)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy response"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* Show a subtle "Done" indicator when stream finishes */}
                {isLastMessage && !isLoading && !msg.error && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"></span>
                    Generated
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
