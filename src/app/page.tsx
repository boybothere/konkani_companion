"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header, type Tab } from "@/components/Header";
import { ChatMessages, type Message } from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Sidebar } from "@/components/Sidebar";
import DocumentTab from "@/components/DocumentTab";
import { readCompanionStream } from "@/lib/sse";
import type { User } from "firebase/auth";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { SignInScreen, SplashScreen } from "@/components/auth/SignInScreen";
import { authFetch } from "@/lib/authFetch";
import * as chatStore from "@/lib/chatStore";

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;
const isAbort = (error: unknown) => (error as Error)?.name === "AbortError";

// Messages saved by older versions stored `error: true`; keep only text errors.
const normalise = (messages: Message[]): Message[] =>
  messages.map((m) => (typeof m.error === "string" ? m : { ...m, error: undefined }));

const newSessionId = () => Date.now().toString();

function ChatApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const uid = user.uid;
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusSince, setStatusSince] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Incremented on every send and session switch; stale streams stop writing.
  const runRef = useRef(0);
  // Last version written to Firestore per chat, to skip redundant writes.
  const savedRef = useRef<Record<string, string>>({});

  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sessionsList, setSessionsList] = useState<chatStore.SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(newSessionId);

  const syncSidebarFromStorage = () => setSessionsList(chatStore.listLocal(uid));

  // On sign-in: adopt chats saved before accounts existed, then pull this
  // user's history from Firestore (other devices) into the local cache.
  useEffect(() => {
    const moved = chatStore.migrateLegacy(uid);
    syncSidebarFromStorage();
    moved.forEach((id) => {
      const legacy = chatStore.loadLocal(uid, id);
      if (legacy) chatStore.saveRemote(uid, id, legacy).catch(() => {});
    });
    chatStore
      .syncFromRemote(uid)
      .then(syncSidebarFromStorage)
      .catch((err) => console.warn("Couldn't load chat history from the cloud:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    setMessages(normalise(chatStore.loadLocal(uid, currentSessionId) ?? []));
    syncSidebarFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, currentSessionId]);

  useEffect(() => {
    if (messages.length === 0) return;
    chatStore.saveLocal(uid, currentSessionId, messages);
    syncSidebarFromStorage();
    // Save to Firestore once an answer has finished, not on every streamed chunk.
    if (isLoading) return;
    const snapshot = JSON.stringify(messages);
    if (savedRef.current[currentSessionId] === snapshot) return;
    savedRef.current[currentSessionId] = snapshot;
    chatStore.saveRemote(uid, currentSessionId, messages).catch((err) => console.warn("Cloud save failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentSessionId, isLoading, uid]);

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

    let answer = "";
    try {
      const res = await authFetch("/api/chat", {
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
    const res = await authFetch("/api/transcribe", { method: "POST", body: formData });
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
    switchSession(newSessionId());
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
        account={{ name: user.displayName, email: user.email, photoURL: user.photoURL }}
        onSignOut={() => {
          runRef.current++;
          abortRef.current?.abort();
          chatStore.clearLocal(uid);
          onSignOut();
        }}
        onNewChat={handleNewChat}
        onLoadChat={switchSession}
        onDeleteChat={(id) => {
          chatStore.removeLocal(uid, id);
          chatStore.deleteRemote(uid, id).catch((err) => console.warn("Cloud delete failed:", err));
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

function Gate() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <SignInScreen />;
  // key: a different account gets a completely fresh app state
  return <ChatApp key={user.uid} user={user} onSignOut={signOut} />;
}

export default function Home() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
