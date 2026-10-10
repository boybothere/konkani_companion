"use client";

import React, { useState, useRef } from "react";
import { Paperclip, Mic, ArrowUp, Square, Loader2 } from "lucide-react";
import KonkaniKeyboard from "./KonkaniKeyboard";

interface ChatInputProps {
  onSendMessage: (message: string, language: "en" | "kok") => void;
  /** Uploads the recording and resolves with the transcript. */
  onAudioSubmit: (audioBlob: Blob) => Promise<string>;
  /** True while an answer is streaming: sending is blocked, Stop is shown. */
  busy?: boolean;
  onStop?: () => void;
  onAttach?: () => void;
}

type MicState = "idle" | "recording" | "transcribing";

const MAX_TEXTAREA_PX = 200;

export default function ChatInput({ onSendMessage, onAudioSubmit, busy = false, onStop, onAttach }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<"en" | "kok">("en");
  const [mic, setMic] = useState<MicState>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  };

  const updateInput = (value: string) => {
    setInput(value);
    requestAnimationFrame(resize);
  };

  const handleInsert = (char: string) => {
    const el = textareaRef.current;
    if (!el) { updateInput(input + char); return; }
    const s = el.selectionStart ?? input.length;
    const e = el.selectionEnd ?? input.length;
    updateInput(input.slice(0, s) + char + input.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
  };

  const handleBackspace = () => {
    const el = textareaRef.current;
    if (!el) { updateInput(input.slice(0, -1)); return; }
    const s = el.selectionStart ?? input.length;
    const e = el.selectionEnd ?? input.length;
    if (s === e && s > 0) {
      updateInput(input.slice(0, s - 1) + input.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s - 1, s - 1); });
    } else if (s !== e) {
      updateInput(input.slice(0, s) + input.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s, s); });
    }
  };

  const canSend = input.trim().length > 0 && !busy && mic === "idle";

  const handleEnter = () => {
    if (!canSend) return;
    onSendMessage(input, language);
    updateInput("");
  };

  const toggleRecording = async () => {
    setMicError(null);
    if (mic === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (mic === "transcribing") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); // release the microphone
        setMic("transcribing");
        try {
          const text = (await onAudioSubmit(new Blob(audioChunksRef.current, { type: "audio/webm" }))).trim();
          if (text) setInput(prev => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
          else setMicError("No speech was recognised. Try speaking a little closer to the microphone.");
          requestAnimationFrame(() => { resize(); textareaRef.current?.focus(); });
        } catch (err) {
          setMicError(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setMic("idle");
        }
      };
      mr.start();
      setMic("recording");
    } catch (err) {
      console.error(err);
      setMicError("Microphone access was blocked. Allow it in your browser settings to use voice input.");
    }
  };

  const placeholder =
    mic === "recording" ? "Listening… tap the stop button when you're done"
      : mic === "transcribing" ? "Transcribing your voice…"
        : language === "kok" ? "कोंकणींत बरयात…" : "Ask anything…";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-3 sm:px-6 sm:pb-5">
      {language === "kok" && (
        <KonkaniKeyboard onInsert={handleInsert} onBackspace={handleBackspace} onEnter={handleEnter} />
      )}

      <form
        onSubmit={e => { e.preventDefault(); handleEnter(); }}
        className="rounded-2xl border border-border-strong bg-surface-2 shadow-lg shadow-black/20 transition-colors focus-within:border-[#4a4f57]"
      >
        <textarea
          ref={textareaRef}
          id="chat-textarea"
          rows={1}
          value={input}
          onChange={e => updateInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleEnter();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          className="block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-foreground placeholder:text-subtle-foreground focus:outline-none"
        />

        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              title="Upload a document"
              aria-label="Upload a document"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={mic === "transcribing"}
            title={mic === "recording" ? "Stop recording" : "Speak in Konkani"}
            aria-label={mic === "recording" ? "Stop recording" : "Record voice"}
            className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors disabled:cursor-wait ${
              mic === "recording"
                ? "bg-destructive/15 text-destructive"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
            }`}
          >
            {mic === "recording" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                </span>
                <Square className="h-3.5 w-3.5 fill-current" />
              </>
            ) : mic === "transcribing" ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Mic className="h-[18px] w-[18px]" />
            )}
          </button>

          {/* Input language toggle */}
          <div className="ml-auto flex items-center rounded-full border border-border bg-background/60 p-0.5 text-xs">
            {(["en", "kok"] as const).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                aria-pressed={language === lang}
                className={`rounded-full px-3 py-1 transition-colors ${
                  language === lang ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lang === "en" ? "English" : <span lang="kok" className="devanagari leading-none">कोंकणी</span>}
              </button>
            ))}
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title="Send"
              aria-label="Send"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-all active:scale-95 disabled:bg-surface-3 disabled:text-subtle-foreground"
            >
              <ArrowUp className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </form>

      <p
        role={micError ? "alert" : undefined}
        className={`mt-2 px-1 text-center text-[11px] ${micError ? "text-destructive" : "text-subtle-foreground"}`}
      >
        {micError ?? "Answers are generated by AI and translated into Konkani. Check important information."}
      </p>
    </div>
  );
}
