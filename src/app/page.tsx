"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ChatMessages } from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Sidebar } from "@/components/Sidebar";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState("");

  // --- SIDEBAR & PERSISTENCE STATE ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessionsList, setSessionsList] = useState<{ id: string, preview: string }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("default-session");

  // --- LOCAL STORAGE SYNC ENGINE ---
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
    // Sort so newest is at the top (optional but recommended)
    sessions.sort((a, b) => Number(b.id) - Number(a.id));
    setSessionsList(sessions);
  };

  // 1. LOAD CHAT ON MOUNT & UPDATE SIDEBAR
  useEffect(() => {
    const saved = localStorage.getItem(`chat_${currentSessionId}`);
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
      setMessages([]); // Clear if it's a completely new session
    }
    syncSidebarFromStorage();
  }, [currentSessionId]);

  // 2. SAVE CHAT ON CHANGE (Local Storage)
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat_${currentSessionId}`, JSON.stringify(messages));
      syncSidebarFromStorage();
    }
  }, [messages, currentSessionId]);

  // --- TEXT HANDLING & STREAMING ---
  const handleSendMessage = async (content: string, language: "en" | "kok") => {
    if (!content.trim()) return;

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setIsLoading(true);

    // --- FIREBASE SAVE TRIGGER (Silent Background Task) ---
    try {
      fetch("/api/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId, messages: newMessages })
      }).catch(err => console.warn("Firebase save pending:", err));
    } catch (e) {
      // Ignored: we rely on localStorage as the primary fast-cache
    }

    // --- LLM STREAMING ENGINE ---
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          language: language,
          stream: true,
        }),
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
                const jsonStr = line.slice(6); // ← safe prefix removal, not .replace()
                if (!jsonStr.trim()) continue;  // ← skip empty lines
                const data = JSON.parse(jsonStr);
                const textChunk = data.choices[0]?.delta?.content || "";
                assistantMessage += textChunk;

                setMessages((prev) => {
                  const updatedMessages = [...prev];
                  updatedMessages[updatedMessages.length - 1].content = assistantMessage;
                  return updatedMessages;
                });
              } catch (e) {
                console.warn("Skipping malformed chunk:", line); // ← warn not error, keeps going
              }
            }
          }
        }
      }

      // Save the final assistant response to Firebase silently
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

  // --- AUDIO HANDLING (INJECTS TO TEXTBOX) ---
  const handleAudioSubmit = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

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

  // --- SIDEBAR HANDLERS ---
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
            handleNewChat(); // Reset if deleting current chat
          } else {
            syncSidebarFromStorage(); // Otherwise just refresh the list
          }
        }}
      />

      <main className="flex-1 flex flex-col h-full relative border-l border-gray-700">
        <Header />

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
      </main>
    </div>
  );
}