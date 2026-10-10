"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header, type Tab } from "@/components/Header";
import { ChatMessages, type Message } from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Sidebar } from "@/components/Sidebar";
import DocumentTab from "@/components/DocumentTab";
import { readCompanionStream } from "@/lib/sse";

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;
const isAbort = (error: unknown) => (error as Error)?.name === "AbortError";

// Messages saved by older versions stored `error: true`; keep only text errors.
const normalise = (messages: Message[]): Message[] =>
  messages.map((m) => (typeof m.error === "string" ? m : { ...m, error: undefined }));

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusSince, setStatusSince] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Incremented on every send and session switch; stale streams stop writing.
  const runRef = useRef(0);

  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sessionsList, setSessionsList] = useState<{ id: string, preview: string }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("default-session");

  const syncSidebarFromStorage = () => {
    const sessions = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("chat_")) {
        const id = key.replace("chat_", "");
        const chatData = JSON.parse(localStorage.getItem(key) || "[]");
        if (chatData.length > 0) {
          sessions.push({
            id,
            preview: chatData[0].content.substring(0, 40),
          });
        }
      }
    }
    sessions.sort((a, b) => Number(b.id) - Number(a.id));
    setSessionsList(sessions);
  };

  useEffect(() => {
    const saved = localStorage.getItem(`chat_${currentSessionId}`);
    if (saved) {
      setMessages(normalise(JSON.parse(saved)));
    } else {
      setMessages([]);
    }
    syncSidebarFromStorage();
  }, [currentSessionId]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat_${currentSessionId}`, JSON.stringify(messages));
      syncSidebarFromStorage();
    }
  }, [messages, currentSessionId]);

  // Patch the last message (the assistant reply being streamed).
  const updateLast = (patch: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
      return next;
    });

  const setStage = (stage: string | null) => {
    setStatus(stage);
    setStatusSince((since) => (stage ? since ?? Date.now() : null));
  };

  const handleSendMessage = async (content: string, language: "en" | "kok") => {
    if (!content.trim() || isLoading) return;

    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setIsLoading(true);
    setStatus("starting");
    setStatusSince(Date.now());

    const controller = new AbortController();
    abortRef.current = controller;
    const run = ++runRef.current;
    const current = () => runRef.current === run;
    const patch: typeof updateLast = (p) => { if (current()) updateLast(p); };

    fetch("/api/save-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, messages: history })
    }).catch(err => console.warn("Firebase save pending:", err));

    let answer = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The English versions let the backend keep conversation context.
          messages: history.map(({ role, content, english }) => ({ role, content, english })),
          language,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "The server returned an error. Please try again.");
      }

      let finished = false;
      for await (const event of readCompanionStream(res)) {
        switch (event.type) {
          case "status":
            if (current()) setStage(event.stage);
            break;
          case "meta":
            if (current()) setMessages((prev) => {
              const next = [...prev];
              const userIndex = next.length - 2;
              if (next[userIndex]?.role === "user") next[userIndex] = { ...next[userIndex], english: event.queryEn };
              return next;
            });
            break;
          case "sources":
            patch({ sources: event.sources, provider: event.provider, searched: true });
            break;
          case "delta":
            answer += event.text;
            patch({ content: answer });
            break;
          case "english":
            patch({ english: event.text });
            break;
          case "error":
            patch({ error: event.message });
            break;
          case "done":
            finished = true;
            break;
        }
      }
      if (!finished) {
        patch((m) => ({ error: m.error ?? "The connection closed before the answer finished. Please try again." }));
      }

      if (current()) fetch("/api/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages: [...history, { role: "assistant", content: answer }]
        })
      }).catch(() => { });

    } catch (error) {
      if (isAbort(error)) {
        patch({ stopped: true });
      } else {
        console.error("Chat Error:", error);
        const offline = error instanceof TypeError; // fetch() itself failed
        patch({
          error: offline
            ? "Couldn't reach the server. Check your connection and try again."
            : error instanceof Error ? error.message : "Something went wrong. Please try again.",
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (current()) {
        setIsLoading(false);
        setStage(null);
      }
    }
  };

  const stopGenerating = () => abortRef.current?.abort();

  const handleAudioSubmit = async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Transcription failed. Please try again.");
    return typeof data.text === "string" ? data.text : "";
  };

  const switchSession = (id: string) => {
    setMobileSidebar(false);
    setActiveTab("chat");
    if (id === currentSessionId) return; // re-selecting the open chat must not stop its answer
    runRef.current++;
    abortRef.current?.abort();
    setIsLoading(false);
    setStage(null);
    setCurrentSessionId(id);
  };

  const handleNewChat = () => {
    switchSession(Date.now().toString());
    setMessages([]);
  };

  const toggleSidebar = () => {
    if (isDesktop()) setDesktopSidebar((v) => !v);
    else setMobileSidebar((v) => !v);
  };

  const closeSidebar = () => {
    if (isDesktop()) setDesktopSidebar(false);
    else setMobileSidebar(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        desktopOpen={desktopSidebar}
        mobileOpen={mobileSidebar}
        onClose={closeSidebar}
        sessionId={currentSessionId}
        sessionsList={sessionsList}
        onNewChat={handleNewChat}
        onLoadChat={switchSession}
        onDeleteChat={(id) => {
          localStorage.removeItem(`chat_${id}`);
          if (id === currentSessionId) {
            handleNewChat();
          } else {
            syncSidebarFromStorage();
          }
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <Header onToggleSidebar={toggleSidebar} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Both tabs stay mounted so switching is instant and keeps their state */}
        <div className={`min-h-0 flex-1 flex-col ${activeTab === "chat" ? "flex" : "hidden"}`}>
          <div className="min-h-0 flex-1">
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              status={status}
              statusSince={statusSince}
              onSuggestion={(text) => handleSendMessage(text, /[ऀ-ॿ]/.test(text) ? "kok" : "en")}
            />
          </div>
          <ChatInput
            onSendMessage={handleSendMessage}
            onAudioSubmit={handleAudioSubmit}
            busy={isLoading}
            onStop={stopGenerating}
            onAttach={() => setActiveTab("document")}
          />
        </div>
        <div className={`min-h-0 flex-1 ${activeTab === "document" ? "block" : "hidden"}`}>
          <DocumentTab />
        </div>
      </main>
    </div>
  );
}
