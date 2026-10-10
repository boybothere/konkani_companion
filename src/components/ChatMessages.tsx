"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check, ArrowDown, AlertCircle, Sparkles } from "lucide-react";
import type { Source } from "@/lib/sse";
import { RichText } from "./RichText";
import { SourcesPanel } from "./SourcesPanel";
import { StatusIndicator } from "./ui/StatusIndicator";

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  english?: string; // English version, sent back to the backend as conversation context
  sources?: Source[];
  provider?: string | null;
  searched?: boolean; // a web search ran for this answer (even if it found nothing)
  error?: string; // shown below any partial answer
  stopped?: boolean;
};

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  status?: string | null;
  statusSince?: number | null;
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  "गोंयचो सद्याचो मुख्यमंत्री कोण?",
  "What are the main crops grown in Goa?",
  "How do I apply for a ration card in Goa?",
  "What is the latest news from Goa today?",
];

const NEAR_BOTTOM_PX = 96;

export function ChatMessages({ messages, isLoading, status, statusSince, onSuggestion }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const userCount = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openSources, setOpenSources] = useState<Record<number, boolean>>({});
  const [highlight, setHighlight] = useState<{ index: number; id: number } | null>(null);

  const visibleMessages = messages.filter((m) => m.role !== "system");

  // Follow the stream only while the reader is at the bottom. Sending a new
  // message always jumps down, since the user just asked for it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const users = messages.filter((m) => m.role === "user").length;
    if (users > userCount.current) stickToBottom.current = true;
    userCount.current = users;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpToLatest = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const showCitation = (index: number, id: number) => {
    setOpenSources((prev) => ({ ...prev, [index]: true }));
    setHighlight({ index, id });
    // Wait one frame so the panel has started opening before scrolling to it.
    requestAnimationFrame(() =>
      document.getElementById(`src-${index}-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    );
    setTimeout(() => setHighlight(null), 1800);
  };

  return (
    <div className="relative h-full min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 sm:px-6">
          {visibleMessages.length === 0 && (
            <div className="flex min-h-[55vh] flex-col items-center justify-center text-center animate-fade-up">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                <span lang="kok" className="devanagari">नमस्कार!</span> How can I help?
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Ask in English or Konkani, by typing or speaking. Answers come back in Devanagari Konkani, with sources.
              </p>
              <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    className="rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-foreground active:scale-[0.99]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {visibleMessages.map((msg, index) => {
              const isLast = index === visibleMessages.length - 1;

              if (msg.role === "user") {
                return (
                  <div key={index} className="flex justify-end animate-fade-up">
                    <div className="prose-answer max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] text-foreground sm:max-w-[75%]">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const isStreaming = isLast && isLoading;
              const hasSources = msg.sources !== undefined && (msg.sources.length > 0 || msg.searched);

              return (
                <div key={index} className="space-y-3 animate-fade-up">
                  {hasSources && (
                    <SourcesPanel
                      sources={msg.sources ?? []}
                      provider={msg.provider}
                      open={!!openSources[index]}
                      onToggle={() => setOpenSources((prev) => ({ ...prev, [index]: !prev[index] }))}
                      highlightId={highlight?.index === index ? highlight.id : null}
                      idPrefix={`src-${index}`}
                    />
                  )}

                  {msg.content && (
                    <RichText
                      text={msg.content}
                      lang="kok"
                      sourceCount={msg.sources?.length ?? 0}
                      onCitation={(id) => showCitation(index, id)}
                      caret={isStreaming && status === "translating"}
                      className="text-[15.5px] text-foreground"
                    />
                  )}

                  {isStreaming && status && <StatusIndicator stage={status} since={statusSince} />}

                  {msg.error && !isStreaming && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="[overflow-wrap:anywhere]">{msg.error}</span>
                    </div>
                  )}

                  {msg.stopped && !isStreaming && (
                    <p className="text-xs text-subtle-foreground">
                      {msg.content ? "Stopped — the answer above is incomplete." : "Stopped before an answer was generated."}
                    </p>
                  )}

                  {msg.content && !isStreaming && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(msg.content, index)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                        aria-label="Copy response"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-accent" />
                            <span className="text-accent">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showJump && visibleMessages.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-strong bg-surface-2/95 px-3 py-1.5 text-xs text-foreground shadow-lg shadow-black/30 backdrop-blur transition-colors hover:bg-surface-3 animate-fade-in"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {isLoading ? "Follow the answer" : "Jump to latest"}
        </button>
      )}
    </div>
  );
}
