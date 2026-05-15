"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ChatMessages } from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Sidebar } from "@/components/Sidebar";
import DocumentTab from "@/components/DocumentTab";
import { MessageSquare, FileSearch } from "lucide-react";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Tab = "chat" | "document";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSendMessage = async (content: string, language: "en" | "kok") => {
    if (!content.trim()) return;

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      fetch("/api/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId, messages: newMessages })
      }).catch(err => console.warn("Firebase save pending:", err));
    } catch (e) { }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, language, stream: true }),
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              try {
                const jsonStr = line.slice(6);
                if (!jsonStr.trim()) continue;
                const data = JSON.parse(jsonStr);
                const textChunk = data.choices[0]?.delta?.content || "";
                assistantMessage += textChunk;
                setMessages((prev) => {
                  const updatedMessages = [...prev];
                  updatedMessages[updatedMessages.length - 1].content = assistantMessage;
                  return updatedMessages;
                });
              } catch (e) {
                console.warn("Skipping malformed chunk:", line);
              }
            }
          }
        }
      }

      fetch("/api/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages: [...newMessages, { role: "assistant", content: assistantMessage }]
        })
      }).catch(() => { });

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error communicating with the server." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioSubmit = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");

    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Transcription failed");
      const data = await res.json();
      setTranscription(data.text);
      setTimeout(() => setTranscription(""), 100);
    } catch (error) {
      console.error("Audio Error:", error);
      alert("❌ Transcription failed. Check Colab logs.");
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
              <ChatMessages messages={messages} isLoading={isLoading} />
            </div>
            <div className="w-full pb-4 pt-2">
              <ChatInput
                onSendMessage={handleSendMessage}
                onAudioSubmit={handleAudioSubmit}
                transcribedText={transcription}
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