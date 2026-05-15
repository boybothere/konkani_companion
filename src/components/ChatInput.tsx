"use client";

import React, { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, Send, Square } from "lucide-react";
import KonkaniKeyboard from "./KonkaniKeyboard";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (transcribedText) setInput(p => p + " " + transcribedText);
  }, [transcribedText]);

  const handleInsert = (char: string) => {
    const el = textareaRef.current;
    if (!el) { setInput(p => p + char); return; }
    const s = el.selectionStart ?? input.length;
    const e = el.selectionEnd ?? input.length;
    const next = input.slice(0, s) + char + input.slice(e);
    setInput(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
  };

  const handleBackspace = () => {
    const el = textareaRef.current;
    if (!el) { setInput(p => p.slice(0, -1)); return; }
    const s = el.selectionStart ?? input.length;
    const e = el.selectionEnd ?? input.length;
    if (s === e && s > 0) {
      setInput(input.slice(0, s - 1) + input.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s - 1, s - 1); });
    } else if (s !== e) {
      setInput(input.slice(0, s) + input.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s, s); });
    }
  };

  const handleEnter = () => {
    if (input.trim()) { onSendMessage(input, language); setInput(""); }
  };

  const toggleRecording = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = () => onAudioSubmit(new Blob(audioChunksRef.current, { type: "audio/webm" }));
      mr.start();
      setIsRecording(true);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 pb-4">

      {/* Language toggle */}
      <div className="flex justify-end mb-2">
        <div className="flex items-center bg-[#2f2f2f] rounded-full p-1 border border-gray-700">
          <button
            onClick={() => setLanguage("en")}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${language === "en" ? "bg-white text-black" : "text-gray-400"}`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage("kok")}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${language === "kok" ? "bg-white text-black" : "text-gray-400"}`}
          >
            Konkani
          </button>
        </div>
      </div>

      {/* Keyboard — only in Konkani mode, above textarea */}
      {language === "kok" && (
        <KonkaniKeyboard
          onInsert={handleInsert}
          onBackspace={handleBackspace}
          onEnter={handleEnter}
        />
      )}

      {/* Textarea */}
      <form
        onSubmit={e => { e.preventDefault(); onSendMessage(input, language); setInput(""); }}
        className="bg-[#2f2f2f] border border-gray-700 rounded-2xl overflow-hidden"
      >
        <textarea
          ref={textareaRef}
          id="chat-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={language === "kok" ? "कोंकणींत बरयात…" : "Message AI..."}
          className="w-full max-h-48 min-h-[56px] bg-transparent text-gray-100 p-4 resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex gap-2">
            <button type="button" className="p-2 text-gray-400 hover:text-white"><Paperclip size={20} /></button>
            <button
              type="button" onClick={toggleRecording}
              className={`p-2 rounded-lg ${isRecording ? "text-red-500 bg-red-500/10" : "text-gray-400 hover:text-white"}`}
            >
              {isRecording ? <Square size={20} /> : <Mic size={20} />}
            </button>
          </div>
          <button type="submit" className="p-2 bg-white text-black rounded-lg"><Send size={20} /></button>
        </div>
      </form>
    </div>
  );
}