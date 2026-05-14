"use client";

import React, { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, Send, Square } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string, language: "en" | "kok") => void;
  onAudioSubmit: (audioBlob: Blob) => void;
  transcribedText?: string;
}

export default function ChatInput({ onSendMessage, onAudioSubmit, transcribedText }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<"en" | "kok">("en");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // When transcription arrives from Colab, inject into textbox
  useEffect(() => {
    if (transcribedText) {
      setInput(prev => prev + " " + transcribedText);
    }
  }, [transcribedText]);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        onAudioSubmit(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 pb-4">
      {/* Language toggle */}
      <div className="flex justify-end gap-2 mb-2">
        <div className="flex items-center bg-[#2f2f2f] rounded-full p-1 border border-gray-700">
          <button
            onClick={() => setLanguage("en")}
            className={`px-4 py-1.5 text-sm rounded-full ${language === "en" ? "bg-white text-black" : "text-gray-400"}`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage("kok")}
            className={`px-4 py-1.5 text-sm rounded-full ${language === "kok" ? "bg-white text-black" : "text-gray-400"}`}
          >
            Konkani
          </button>
        </div>
      </div>

      {/* Input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSendMessage(input, language);
          setInput("");
        }}
        className="bg-[#2f2f2f] border border-gray-700 rounded-2xl overflow-hidden"
      >
        <textarea
          id="chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message AI..."
          className="w-full max-h-48 min-h-[56px] bg-transparent text-gray-100 p-4 resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex gap-2">
            <button type="button" className="p-2 text-gray-400 hover:text-white">
              <Paperclip size={20} />
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-2 rounded-lg ${isRecording ? "text-red-500 bg-red-500/10" : "text-gray-400 hover:text-white"}`}
            >
              {isRecording ? <Square size={20} /> : <Mic size={20} />}
            </button>
          </div>
          <button type="submit" className="p-2 bg-white text-black rounded-lg">
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}