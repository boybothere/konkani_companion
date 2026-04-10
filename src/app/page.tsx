"use client";

import { useState, useEffect } from "react";
import { saveMessage, getChatHistory, getAllSessions, deleteSession } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Session = {
  id: string;
  preview: string;
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [sessionId, setSessionId] = useState("");
  const [sessionsList, setSessionsList] = useState<Session[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "Welcome! Start a conversation with your AI assistant." },
  ]);

  // Just start a new chat and load history on mount
  useEffect(() => {
    startNewChat();
    refreshSidebar();
  }, []);

  const refreshSidebar = async () => {
    const pastSessions = await getAllSessions();
    setSessionsList(pastSessions);
  };

  const startNewChat = () => {
    const newSessionId = "chat-" + Math.random().toString(36).substring(2, 9);
    setSessionId(newSessionId);
    setMessages([
      { role: "system", content: "Welcome! Start a conversation with your AI assistant." },
    ]);
  };

  const loadOldChat = async (id: string) => {
    setSessionId(id);
    setMessages([{ role: "system", content: "Loading conversation..." }]);
    const history = await getChatHistory(id);

    if (history.length > 0) {
      setMessages(history);
    } else {
      setMessages([{ role: "system", content: "No messages found for this session." }]);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await deleteSession(id);
      setSessionsList((prev) => prev.filter((s) => s.id !== id));

      if (sessionId === id) {
        startNewChat();
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const sendMessage = async (userText: string) => {
    // Removed the check for selectedModel
    if (!userText.trim() || isLoading || !sessionId) return;

    const userMessage: Message = { role: "user", content: userText };
    const currentMessages = [...messages, userMessage];

    // ONLY append the user message for now.
    setMessages(currentMessages);

    // This triggers YOUR loading bubble (...)
    setIsLoading(true);

    await saveMessage(sessionId, "user", userText);
    refreshSidebar();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages.filter((m) => m.role !== "system"),
          model: "llama-3.3-70b-versatile", // Hardcoded!
          stream: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let assistantContent = "";
      let buffer = "";
      let isFirstChunk = true;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (line === "[DONE]") break;
            if (!line) continue;

            try {
              const data = JSON.parse(line);
              const delta = data.choices[0]?.delta?.content || "";
              if (!delta) continue;

              assistantContent += delta;

              // If this is the first word, kill the loading bubble and create the assistant message
              if (isFirstChunk) {
                setIsLoading(false);
                setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
                isFirstChunk = false;
              } else {
                // Otherwise, safely update the existing assistant message
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = assistantContent;
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }

      await saveMessage(sessionId, "assistant", assistantContent);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      setIsLoading(false);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMessage}` }]);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sessionId={sessionId}
        sessionsList={sessionsList}
        onNewChat={startNewChat}
        onLoadChat={loadOldChat}
        onDeleteChat={handleDeleteChat}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Header no longer requires props */}
        <Header />

        <ChatMessages messages={messages} isLoading={isLoading} />

        {/* Removed isModelsLoading dependency from isDisabled */}
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          isDisabled={isLoading}
        />
      </main>
    </div>
  );
}