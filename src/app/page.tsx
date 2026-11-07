"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header, type Tab } from "@/components/Header";
import { ChatMessages, type Message } from "@/components/ChatMessages";
import ChatInput, { type AnswerLanguage } from "@/components/ChatInput";
import { ChatToolbar } from "@/components/ChatToolbar";
import { Sidebar } from "@/components/Sidebar";
import DocumentTab from "@/components/DocumentTab";
import InterpreterTab from "@/components/InterpreterTab";
import { readCompanionStream } from "@/lib/sse";
import type { User } from "firebase/auth";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { SignInScreen, SplashScreen } from "@/components/auth/SignInScreen";
import { authFetch } from "@/lib/authFetch";
import * as chatStore from "@/lib/chatStore";
import { transcribe } from "@/lib/speech";
import {
  EMPTY_MEMORY,
  clearMemory,
  loadMemory,
  mightContainPersonalInfo,
  proposeMemory,
  sameFacts,
  saveMemory,
  type MemoryState,
} from "@/lib/memory";
import { MemoryPanel } from "@/components/MemoryPanel";

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;
const isAbort = (error: unknown) => (error as Error)?.name === "AbortError";

// Messages saved by older versions stored `error: true`; keep only text errors.
const normalise = (messages: Message[]): Message[] =>
  messages.map((m) => (typeof m.error === "string" ? m : { ...m, error: undefined }));

const newSessionId = () => Date.now().toString();

const LANGUAGE_KEY = "kc:language";

// The conversation language (the English | Konkani toggle), remembered per
// browser. Konkani unless the user chose English.
function useConversationLanguage(): [AnswerLanguage, (language: AnswerLanguage) => void] {
  const [language, setLanguage] = useState<AnswerLanguage>("kok");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (localStorage.getItem(LANGUAGE_KEY) === "en") setLanguage("en");
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  const update = (next: AnswerLanguage) => {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  };
  return [language, update];
}

function ChatApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const uid = user.uid;
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [language, setLanguage] = useConversationLanguage();
  const languageRef = useRef<AnswerLanguage>("kok");
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  // The latest memory, for use inside async callbacks.
  const memoryRef = useRef<MemoryState>(EMPTY_MEMORY);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(newSessionId);

  const syncSidebarFromStorage = () => setSessionsList(chatStore.listLocal(uid));

  // On sign-in: adopt chats saved before accounts existed, then pull this
  // user's history from Firestore (other devices) into the local cache.
  useEffect(() => {
    const moved = chatStore.migrateLegacy(uid);
    // Local storage is an external store: sync the sidebar from it after sign-in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncSidebarFromStorage();
    moved.forEach((id) => {
      const legacy = chatStore.loadLocal(uid, id);
      if (legacy) chatStore.saveRemote(uid, id, legacy).catch(() => {});
    });
    loadMemory(uid)
      .then(setMemory)
      .catch((err) => console.warn("Couldn't load memory:", err));
    chatStore
      .syncFromRemote(uid)
      .then(syncSidebarFromStorage)
      .catch((err) => console.warn("Couldn't load chat history from the cloud:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    const loaded = normalise(chatStore.loadLocal(uid, currentSessionId) ?? []);
    // Opening a chat is not a change: don't re-save it (that would bump it to the top).
    savedRef.current[currentSessionId] = JSON.stringify(loaded);
    // Loading the selected chat from local storage (an external store).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loaded);
    syncSidebarFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, currentSessionId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const snapshot = JSON.stringify(messages);
    if (savedRef.current[currentSessionId] === snapshot) return; // unchanged since load or last save
    chatStore.saveLocal(uid, currentSessionId, messages);
    syncSidebarFromStorage();
    // Save to Firestore once an answer has finished, not on every streamed chunk.
    if (isLoading) return;
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

  const updateMemory = (next: MemoryState) => {
    setMemory(next);
    setMemoryError(null);
    saveMemory(uid, next).catch((err) => {
      console.warn("Couldn't save memory:", err);
      setMemoryError("Couldn't save your memory. Check your connection and try again.");
    });
  };

  const forgetEverything = () => {
    const next = { facts: [], enabled: memoryRef.current.enabled };
    setMemory(next);
    clearMemory(uid)
      .then(() => saveMemory(uid, next))
      .catch(() => setMemoryError("Couldn't clear your memory. Please try again."));
  };

  /** After a finished answer, let the server propose memory updates (rarely). */
  const maybeRemember = (original: string, questionEn: string, answerEn: string) => {
    const current = memoryRef.current;
    if (!current.enabled || !questionEn || !mightContainPersonalInfo(questionEn, original)) return;
    proposeMemory(current.facts, questionEn, answerEn)
      .then((facts) => {
        const latest = memoryRef.current;
        if (facts && latest.enabled && !sameFacts(facts, latest.facts)) updateMemory({ ...latest, facts });
      })
      .catch(() => {}); // memory is best-effort; never disturb the chat
  };

  const setStage = (stage: string | null) => {
    setStatus(stage);
    setStatusSince((since) => (stage ? since ?? Date.now() : null));
  };

  const handleSendMessage = async (
    content: string,
    language: "en" | "kok",
    conversationLanguage: AnswerLanguage = languageRef.current,
  ) => {
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
    let questionEn = "";
    let answerEn = "";
    let failed = false;
    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The English versions let the backend keep conversation context.
          messages: history.map(({ role, content, english }) => ({ role, content, english })),
          language,
          // The toggle decides the answer language; `language` above is only a
          // hint for detecting the question's language (it's detected from its script).
          output_language: conversationLanguage,
          memory: memory.enabled ? memory.facts : [],
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
            questionEn = event.queryEn;
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
            answerEn = event.text;
            patch({ english: event.text });
            break;
          case "error":
            failed = true;
            patch({ error: event.message });
            break;
          case "done":
            finished = true;
            break;
        }
      }
      if (!finished) {
        patch((m) => ({ error: m.error ?? "The connection closed before the answer finished. Please try again." }));
      } else if (!failed && current()) {
        maybeRemember(content, questionEn, answerEn);
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

  // English or Konkani speech is detected on the server, whatever the toggle says.
  const handleAudioSubmit = (audioBlob: Blob): Promise<string> => transcribe(audioBlob, "auto");

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

  const renameChat = (id: string, title: string) => {
    chatStore.renameChat(uid, id, title).catch((err) => console.warn("Cloud rename failed:", err));
    syncSidebarFromStorage();
  };

  const currentTitle =
    chatStore.getTitle(uid, currentSessionId) ||
    (messages.find((m) => m.role === "user")?.content ?? "New chat").replace(/\s+/g, " ").slice(0, 60);

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
        sessionsList={searchQuery.trim() ? chatStore.searchLocal(uid, searchQuery) : sessionsList}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRenameChat={renameChat}
        account={{ name: user.displayName, email: user.email, photoURL: user.photoURL }}
        onOpenMemory={() => setMemoryOpen(true)}
        memoryCount={memory.enabled ? memory.facts.length : 0}
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

      <MemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        memory={memory}
        onChange={updateMemory}
        onClearAll={forgetEverything}
        error={memoryError}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <Header onToggleSidebar={toggleSidebar} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "chat" && messages.length > 0 && (
            <ChatToolbar
              title={currentTitle}
              messages={messages}
              busy={isLoading}
              onRename={(title) => renameChat(currentSessionId, title)}
            />
          )}
        </Header>

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
            language={language}
            onLanguageChange={setLanguage}
            busy={isLoading}
            onStop={stopGenerating}
            onAttach={() => setActiveTab("document")}
          />
        </div>
        <div className={`min-h-0 flex-1 ${activeTab === "document" ? "block" : "hidden"}`}>
          <DocumentTab answerLanguage={language} />
        </div>
        <div className={`min-h-0 flex-1 ${activeTab === "interpreter" ? "block" : "hidden"}`}>
          <InterpreterTab />
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
