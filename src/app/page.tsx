"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ChatMessages, type Message } from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Sidebar } from "@/components/Sidebar";
import DocumentTab from "@/components/DocumentTab";
import { MessageSquare, FileSearch } from "lucide-react";
import { readCompanionStream } from "@/lib/sse";

type Tab = "chat" | "document";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
            preview: chatData[0].content.substring(0, 30) + "...",
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
      setMessages(JSON.parse(saved));
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
  const updateLast = (patch: Partial<Message>) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });

  const handleSendMessage = async (content: string, language: "en" | "kok") => {
    if (!content.trim() || isLoading) return;

    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setIsLoading(true);
    setStatus("starting");

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
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "The server returned an error.");
      }

      let finished = false;
      for await (const event of readCompanionStream(res)) {
        switch (event.type) {
          case "status":
            setStatus(event.stage);
            break;
          case "meta":
            setMessages((prev) => {
              const next = [...prev];
              const userIndex = next.length - 2;
              if (next[userIndex]?.role === "user") next[userIndex] = { ...next[userIndex], english: event.queryEn };
              return next;
            });
            break;
          case "sources":
            updateLast({ sources: event.sources });
            break;
          case "delta":
            answer += event.text;
            updateLast({ content: answer });
            break;
          case "english":
            updateLast({ english: event.text });
            break;
          case "error":
            answer = answer ? `${answer}\n\n⚠ ${event.message}` : event.message;
            updateLast({ content: answer, error: true });
            break;
          case "done":
            finished = true;
            break;
        }
      }
      if (!finished) {
        answer = `${answer}\n\n⚠ The answer was cut off. Please try again.`.trim();
        updateLast({ content: answer, error: true });
      }

      fetch("/api/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages: [...history, { role: "assistant", content: answer }]
        })
      }).catch(() => { });

    } catch (error) {
      console.error("Chat Error:", error);
      const message = error instanceof Error ? error.message : "Sorry, I encountered an error communicating with the server.";
      updateLast({ content: answer ? `${answer}\n\n⚠ ${message}` : message, error: true });
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
  };

  const handleAudioSubmit = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");

    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      setTranscription(data.text);
      setTimeout(() => setTranscription(""), 100);
    } catch (error) {
      console.error("Audio Error:", error);
      alert(`❌ ${error instanceof Error ? error.message : "Transcription failed."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setMessages([]);
  };

  return (
    <div className="flex h-screen bg-[#212121] text-white font-sans overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        sessionId={currentSessionId}
        sessionsList={sessionsList}
        onNewChat={handleNewChat}
        onLoadChat={(id) => setCurrentSessionId(id)}
        onDeleteChat={(id) => {
          localStorage.removeItem(`chat_${id}`);
          if (id === currentSessionId) {
            handleNewChat();
          } else {
            syncSidebarFromStorage();
          }
        }}
      />

      <main className="flex-1 flex flex-col h-full relative border-l border-gray-700 overflow-hidden">
        <Header />

        {/* ── Tab switcher ── */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-700">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${activeTab === "chat"
              ? "bg-[#2f2f2f] text-white border border-b-0 border-gray-700"
              : "text-gray-400 hover:text-gray-200"
              }`}
          >
            <MessageSquare size={15} />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("document")}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${activeTab === "document"
              ? "bg-[#2f2f2f] text-white border border-b-0 border-gray-700"
              : "text-gray-400 hover:text-gray-200"
              }`}
          >
            <FileSearch size={15} />
            Document Lens
          </button>
        </div>

        {/* ── Tab content ── */}
        {activeTab === "chat" ? (
          <>
            <div className="flex-1 overflow-y-auto w-full">
              <ChatMessages messages={messages} isLoading={isLoading} status={status} />
            </div>
            <div className="w-full pb-4 pt-2">
              <ChatInput
                onSendMessage={handleSendMessage}
                onAudioSubmit={handleAudioSubmit}
                transcribedText={transcription}
                disabled={isLoading}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <DocumentTab />
          </div>
        )}
      </main>
    </div>
  );
}
