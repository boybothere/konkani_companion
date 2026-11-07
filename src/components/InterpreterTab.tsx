"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Copy, Check, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { transcribe, translate, type SpokenLanguage } from "@/lib/speech";

// Interpreter: a face-to-face conversation between an English speaker and a
// Konkani speaker. Each turn is transcribed (if spoken) and translated with the
// project's own Konkani translation model; no AI-generated answers.

type Turn = {
  id: number;
  speaker: SpokenLanguage;
  original: string;
  translation: string;
  stage: "transcribing" | "translating" | "done" | "error";
  error?: string;
};

const SIDES: { lang: SpokenLanguage; title: string; titleLocal: string; placeholder: string; target: string }[] = [
  { lang: "en", title: "English speaker", titleLocal: "English", placeholder: "Type in English…", target: "Konkani" },
  { lang: "kok", title: "Konkani speaker", titleLocal: "कोंकणी", placeholder: "कोंकणींत बरयात…", target: "English" },
];

const isDeva = (text: string) => /[ऀ-ॿ]/.test(text);

export default function InterpreterTab() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recording, setRecording] = useState<SpokenLanguage | null>(null);
  const [drafts, setDrafts] = useState<Record<SpokenLanguage, string>>({ en: "", kok: "" });
  const [micError, setMicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Release the microphone if the tab unmounts mid-recording.
  useEffect(() => () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const update = (id: number, patch: Partial<Turn>) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const busy = turns.some((t) => t.stage === "transcribing" || t.stage === "translating");

  /** Translate one turn; `audio` is transcribed first. */
  const runTurn = async (speaker: SpokenLanguage, input: { text?: string; audio?: Blob }) => {
    const id = nextId.current++;
    setTurns((prev) => [
      ...prev,
      { id, speaker, original: input.text ?? "", translation: "", stage: input.audio ? "transcribing" : "translating" },
    ]);
    try {
      let original = input.text ?? "";
      if (input.audio) {
        original = await transcribe(input.audio, speaker);
        if (!original) {
          update(id, { stage: "error", error: "No speech was recognised. Try again, a little closer to the microphone." });
          return;
        }
        update(id, { original, stage: "translating" });
      }
      const { translation } = await translate(original, speaker === "en" ? "en2kok" : "kok2en");
      update(id, { translation, stage: "done" });
    } catch (err) {
      update(id, { stage: "error", error: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  const toggleMic = async (speaker: SpokenLanguage) => {
    setMicError(null);
    if (recording) {
      if (recording === speaker) recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        void runTurn(speaker, { audio: new Blob(chunksRef.current, { type: "audio/webm" }) });
      };
      recorder.start();
      setRecording(speaker);
    } catch {
      setMicError("Microphone access was blocked. Allow it in your browser settings, or type instead.");
    }
  };

  const sendText = (speaker: SpokenLanguage) => {
    const text = drafts[speaker].trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [speaker]: "" }));
    void runTurn(speaker, { text });
  };

  const copyConversation = async () => {
    const lines = turns
      .filter((t) => t.stage === "done")
      .map((t) => `${t.speaker === "en" ? "English speaker" : "Konkani speaker"}: ${t.original}\n→ ${t.translation}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: nothing to do
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Interpreter</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                For a conversation between an English speaker and a Konkani speaker. Each person speaks or types on their
                side; Sangati translates it with its own Konkani translation model.
              </p>
            </div>
            {turns.length > 0 && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={copyConversation}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setTurns([])}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            )}
          </div>

          {turns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-subtle-foreground">
              Tap a microphone below to start. The English speaker&apos;s words appear in Konkani, and the Konkani
              speaker&apos;s words appear in English.
            </div>
          ) : (
            <ol className="space-y-3" aria-live="polite">
              {turns.map((t) => {
                const fromEnglish = t.speaker === "en";
                return (
                  <li key={t.id} className={`flex ${fromEnglish ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`w-full max-w-[88%] space-y-2 rounded-2xl border px-4 py-3 sm:max-w-[75%] ${
                        fromEnglish ? "rounded-bl-md border-border bg-card" : "rounded-br-md border-border-strong bg-surface-2"
                      }`}
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
                        {fromEnglish ? "English speaker" : "Konkani speaker"}
                      </p>
                      {t.original ? (
                        <p lang={isDeva(t.original) ? "kok" : "en"} className={`text-sm text-muted-foreground ${isDeva(t.original) ? "devanagari" : ""}`}>
                          {t.original}
                        </p>
                      ) : null}
                      {t.stage === "done" && (
                        <p
                          lang={fromEnglish ? "kok" : "en"}
                          className={`text-[16px] font-medium text-foreground ${fromEnglish ? "devanagari" : ""}`}
                        >
                          {t.translation}
                        </p>
                      )}
                      {(t.stage === "transcribing" || t.stage === "translating") && (
                        <p className="flex items-center gap-2 text-xs text-subtle-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t.stage === "transcribing" ? "Listening to the recording…" : `Translating to ${fromEnglish ? "Konkani" : "English"}…`}
                        </p>
                      )}
                      {t.stage === "error" && (
                        <p className="flex items-start gap-2 text-sm text-destructive">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t.error}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* The two speakers' controls */}
      <div className="shrink-0 border-t border-border bg-background/95 px-3 py-3 sm:px-6">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
          {SIDES.map((side) => {
            const isRecording = recording === side.lang;
            return (
              <div key={side.lang} className="rounded-2xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {side.title}
                    <span className="ml-2 text-xs font-normal text-subtle-foreground">→ {side.target}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleMic(side.lang)}
                    disabled={recording !== null && !isRecording}
                    aria-pressed={isRecording}
                    aria-label={isRecording ? `Stop recording (${side.title})` : `Speak (${side.title})`}
                    className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                      isRecording ? "bg-destructive/15 text-destructive" : "bg-foreground text-background"
                    }`}
                  >
                    {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                    {isRecording ? "Stop" : "Speak"}
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendText(side.lang);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={drafts[side.lang]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [side.lang]: e.target.value }))}
                    placeholder={side.placeholder}
                    lang={side.lang === "kok" ? "kok" : "en"}
                    aria-label={`${side.title}: type a message`}
                    maxLength={2000}
                    className={`min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      side.lang === "kok" ? "devanagari" : ""
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!drafts[side.lang].trim()}
                    aria-label={`Translate (${side.title})`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:bg-surface-3 disabled:text-subtle-foreground"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        {micError && (
          <p role="alert" className="mx-auto mt-2 max-w-4xl text-center text-xs text-destructive">
            {micError}
          </p>
        )}
      </div>
    </div>
  );
}
