"use client";

import React, { useState, useRef, useEffect } from "react";
import {
    Upload, FileText, X, AlertCircle, ChevronDown, Copy, Check, ArrowUp, Square, RotateCcw, MessageSquare,
} from "lucide-react";
import { readCompanionStream } from "@/lib/sse";
import { authFetch } from "@/lib/authFetch";
import { RichText } from "./RichText";
import { StatusIndicator } from "./ui/StatusIndicator";

interface AnalysisResult {
    ocr_text: string;
    english_translation: string;
    summary: string;            // Devanagari Konkani
    summary_english?: string;   // present on the Phase 1 backend
    error: boolean;
    pages?: number;
    method?: "pdf-text" | "ocr" | "mixed";
    truncated?: boolean;
}

interface DocMessage {
    role: "user" | "assistant";
    content: string;        // Konkani
    english?: string;       // streamed alongside, shown for summary questions
    bilingual?: boolean;
    error?: string;
    stopped?: boolean;
}

const MAX_BYTES = 15 * 1024 * 1024; // matches the backend's MAX_DOCUMENT_BYTES default
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff";
const EXTENSIONS = ACCEPT.split(",");

const METHOD_LABELS: Record<string, string> = {
    "pdf-text": "Text read directly from the PDF",
    ocr: "Text read with OCR",
    mixed: "PDF text + OCR",
};

const SUMMARY_INTENT = /\b(summar(y|ies|ise|ize|ised|ized)|overview|gist|main points?|key points?|in short|briefly|tl;?dr|recap|outline)\b/i;
const SUMMARY_INTENT_KOK = /(सारांश|गोशवारो|गोषवारो|थोडक्यांत|थोडक्यात)/;

const wantsBilingual = (question: string, questionEn = "") =>
    SUMMARY_INTENT.test(question) || SUMMARY_INTENT.test(questionEn) || SUMMARY_INTENT_KOK.test(question);

const QUESTION_SUGGESTIONS = ["Summarise this document", "What should I do next?", "Are there any deadlines or amounts?"];

const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const isAbort = (error: unknown) => (error as Error)?.name === "AbortError";

function validate(file: File): string | null {
    const name = file.name.toLowerCase();
    if (!EXTENSIONS.some(ext => name.endsWith(ext))) return "Unsupported file type. Upload a PDF, PNG, JPEG, WEBP or TIFF file.";
    if (file.size === 0) return "This file is empty.";
    if (file.size > MAX_BYTES) return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`;
    return null;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-subtle-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
            aria-label="Copy"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            <span className={copied ? "text-accent" : ""}>{copied ? "Copied" : "Copy"}</span>
        </button>
    );
}

function LanguagePanel({ label, sublabel, text, lang, caret, pending }: {
    label: string; sublabel?: string; text: string; lang?: string; caret?: boolean; pending?: string;
}) {
    return (
        <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-5">
            <header className="mb-3 flex items-center gap-2">
                <span lang={lang} className={`text-sm font-semibold text-foreground ${lang === "kok" ? "devanagari" : ""}`}>{label}</span>
                {sublabel && <span className="text-xs text-subtle-foreground">{sublabel}</span>}
                <span className="ml-auto">{text && !caret && <CopyButton text={text} />}</span>
            </header>
            {text ? (
                <RichText text={text} lang={lang} caret={caret} className="text-[15px] text-foreground" />
            ) : (
                <p className="text-sm text-subtle-foreground">{pending}</p>
            )}
        </section>
    );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground sm:px-5"
            >
                {title}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            <div className="collapsible" data-open={open}>
                <div inert={!open}>
                    <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-4 sm:px-5">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default function DocumentTab() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    const [stage, setStage] = useState<string | null>(null);
    const [since, setSince] = useState<number | null>(null);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    const [docMessages, setDocMessages] = useState<DocMessage[]>([]);
    const [question, setQuestion] = useState("");
    const [askStage, setAskStage] = useState<string | null>(null);
    const [askSince, setAskSince] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const analyzeAbort = useRef<AbortController | null>(null);
    const askAbort = useRef<AbortController | null>(null);

    const analyzing = stage !== null;
    const asking = askStage !== null;

    // Free the image preview's memory when it changes or the tab unmounts.
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    // ── File selection ──────────────────────────────────────────
    const selectFile = (f: File | undefined) => {
        if (!f || analyzing) return;
        const error = validate(f);
        setFileError(error);
        if (error) return;
        askAbort.current?.abort();
        setFile(f);
        setResult(null);
        setAnalyzeError(null);
        setDocMessages([]);
        setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    };

    const clearFile = () => {
        analyzeAbort.current?.abort();
        askAbort.current?.abort();
        setFile(null);
        setPreview(null);
        setResult(null);
        setAnalyzeError(null);
        setFileError(null);
        setDocMessages([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // ── Analyze document ────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!file || analyzing) return;
        const controller = new AbortController();
        analyzeAbort.current = controller;
        setStage("uploading");
        setSince(Date.now());
        setResult(null);
        setAnalyzeError(null);
        setDocMessages([]);

        const formData = new FormData();
        formData.append("file", file);

        try {
            let data: unknown = null;
            const res = await authFetch("/api/analyze-document?stream=1", { method: "POST", body: formData, signal: controller.signal });

            if (res.status === 404) {
                // Older backend without stage reporting: one honest "processing" state.
                setStage("processing");
                const plain = await authFetch("/api/analyze-document", { method: "POST", body: formData, signal: controller.signal });
                data = await plain.json().catch(() => ({}));
                if (!plain.ok) throw new Error((data as { error?: string }).error || "Failed to analyze the document.");
            } else if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to analyze the document.");
            } else {
                for await (const event of readCompanionStream(res)) {
                    if (event.type === "status") setStage(event.stage);
                    else if (event.type === "result") data = event.data;
                    else if (event.type === "error") throw new Error(event.message);
                }
                if (!data) throw new Error("The connection closed before the analysis finished. Please try again.");
            }

            const parsed = data as AnalysisResult;
            if (typeof parsed?.summary !== "string") throw new Error("The server returned an unexpected response.");
            if (parsed.error) setAnalyzeError(parsed.summary);
            else setResult(parsed);
        } catch (err) {
            if (!isAbort(err)) {
                console.error(err);
                setAnalyzeError(
                    err instanceof TypeError
                        ? "Couldn't reach the server. Check your connection and try again."
                        : err instanceof Error ? err.message : "Failed to analyze the document."
                );
            }
        } finally {
            if (analyzeAbort.current === controller) analyzeAbort.current = null;
            setStage(null);
            setSince(null);
        }
    };

    // ── Document Q&A ────────────────────────────────────────────
    const updateAnswer = (patch: Partial<DocMessage>) =>
        setDocMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], ...patch };
            return next;
        });

    const handleAsk = async (text: string = question) => {
        const q = text.trim();
        if (!q || asking || !result?.english_translation) return;

        setDocMessages(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: "", english: "", bilingual: wantsBilingual(q) }]);
        setQuestion("");
        setAskStage("starting");
        setAskSince(Date.now());
        const controller = new AbortController();
        askAbort.current = controller;

        let answer = "";
        let english = "";
        try {
            const res = await authFetch("/api/document-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: q, document_context: result.english_translation }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Couldn't get an answer. Please try again.");
            }

            let finished = false;
            for await (const event of readCompanionStream(res)) {
                switch (event.type) {
                    case "status": setAskStage(event.stage); break;
                    case "meta": if (wantsBilingual(q, event.queryEn)) updateAnswer({ bilingual: true }); break;
                    case "englishDelta": english += event.text; updateAnswer({ english }); break;
                    case "english": if (!english) { english = event.text; updateAnswer({ english }); } break;
                    case "delta": answer += event.text; updateAnswer({ content: answer }); break;
                    case "error": updateAnswer({ error: event.message }); break;
                    case "done": finished = true; break;
                }
            }
            if (!finished) updateAnswer({ error: "The connection closed before the answer finished. Please try again." });
        } catch (err) {
            if (isAbort(err)) updateAnswer({ stopped: true });
            else updateAnswer({
                error: err instanceof TypeError
                    ? "Couldn't reach the server. Check your connection and try again."
                    : err instanceof Error ? err.message : "Couldn't get an answer.",
            });
        } finally {
            if (askAbort.current === controller) askAbort.current = null;
            setAskStage(null);
            setAskSince(null);
        }
    };

    const showUpload = !result;

    return (
        <div className="h-full overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Document Lens</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Upload a notice, circular or letter in Devanagari. You&apos;ll get summaries in Konkani and English, and can ask questions about it.
                    </p>
                </div>

                {/* ── Upload / selected file ── */}
                {!file ? (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files?.[0]); }}
                    >
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-14 ${
                                dragging ? "border-accent bg-accent/5" : "border-border-strong hover:border-[#4a4f57] hover:bg-card/60"
                            }`}
                        >
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                            </span>
                            <span className="text-sm font-medium text-foreground">
                                {dragging ? "Drop to upload" : "Drop a document here, or click to choose"}
                            </span>
                            <span className="text-xs text-subtle-foreground">
                                PDF, PNG, JPEG, WEBP or TIFF · up to {formatBytes(MAX_BYTES)} · printed Devanagari works best
                            </span>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            {preview ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                                <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
                            ) : (
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                                <p className="text-xs text-subtle-foreground">{formatBytes(file.size)}</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearFile}
                                aria-label="Remove document"
                                title="Remove document"
                                className="ml-auto rounded-lg p-2 text-subtle-foreground transition-colors hover:bg-surface-3 hover:text-foreground sm:hidden"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {analyzing ? (
                                <button
                                    type="button"
                                    onClick={() => analyzeAbort.current?.abort()}
                                    className="flex-1 rounded-xl border border-border-strong px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 sm:flex-none"
                                >
                                    Cancel
                                </button>
                            ) : showUpload ? (
                                <button
                                    type="button"
                                    onClick={handleAnalyze}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.99] sm:flex-none"
                                >
                                    {analyzeError ? <RotateCcw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                    {analyzeError ? "Try again" : "Analyze document"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={clearFile}
                                    className="flex-1 rounded-xl border border-border-strong px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 sm:flex-none"
                                >
                                    Analyze another
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={clearFile}
                                aria-label="Remove document"
                                title="Remove document"
                                className="hidden rounded-lg p-2 text-subtle-foreground transition-colors hover:bg-surface-3 hover:text-foreground sm:block"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => selectFile(e.target.files?.[0])}
                />

                {fileError && (
                    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {fileError}
                    </p>
                )}

                {analyzing && <StatusIndicator stage={stage} since={since} />}

                {analyzeError && !analyzing && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="[overflow-wrap:anywhere]">{analyzeError}</span>
                    </div>
                )}

                {/* ── Results ── */}
                {result && (
                    <div className="space-y-5 animate-fade-up">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h3 className="text-base font-semibold text-foreground">Summary</h3>
                            <p className="text-xs text-subtle-foreground">
                                {[
                                    result.pages ? `${result.pages} page${result.pages > 1 ? "s" : ""}` : null,
                                    result.method ? METHOD_LABELS[result.method] ?? result.method : null,
                                    result.truncated ? "only the first part was processed" : null,
                                ].filter(Boolean).join(" · ")}
                            </p>
                        </div>

                        <div className={`grid grid-cols-1 gap-4 ${result.summary_english ? "md:grid-cols-2" : ""}`}>
                            <LanguagePanel label="कोंकणी" sublabel="Konkani" text={result.summary} lang="kok" />
                            {result.summary_english && (
                                <LanguagePanel label="English" text={result.summary_english} lang="en" />
                            )}
                        </div>

                        {result.english_translation && (
                            <Disclosure title="Full English translation">
                                <p className="prose-answer whitespace-pre-line text-sm text-muted-foreground">{result.english_translation}</p>
                            </Disclosure>
                        )}
                        {result.ocr_text && (
                            <Disclosure title="Extracted text (original)">
                                <p lang="kok" className="prose-answer devanagari whitespace-pre-line text-sm text-muted-foreground">{result.ocr_text}</p>
                            </Disclosure>
                        )}

                        {/* ── Document Q&A ── */}
                        <section className="rounded-2xl border border-border bg-card">
                            <header className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground sm:px-5">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" /> Ask about this document
                            </header>

                            <div className="space-y-5 px-4 py-4 sm:px-5">
                                {docMessages.length === 0 && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-subtle-foreground">
                                            Answers are in Konkani. Ask for a summary to get it in Konkani and English.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {QUESTION_SUGGESTIONS.map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => handleAsk(s)}
                                                    className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {docMessages.map((msg, i) => {
                                    const isLast = i === docMessages.length - 1;
                                    const streaming = isLast && asking;
                                    if (msg.role === "user") {
                                        return (
                                            <div key={i} className="flex justify-end">
                                                <div className="prose-answer max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2 text-sm text-foreground">
                                                    {msg.content}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={i} className="space-y-3">
                                            {msg.bilingual ? (
                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                    <LanguagePanel
                                                        label="कोंकणी" sublabel="Konkani" text={msg.content} lang="kok"
                                                        caret={streaming && !!msg.content}
                                                        pending={streaming ? "Translating…" : msg.stopped ? "Stopped." : ""}
                                                    />
                                                    <LanguagePanel
                                                        label="English" text={msg.english ?? ""} lang="en"
                                                        caret={streaming && !!msg.english && askStage !== "translating"}
                                                        pending={streaming ? "Writing…" : ""}
                                                    />
                                                </div>
                                            ) : msg.content ? (
                                                <RichText text={msg.content} lang="kok" caret={streaming} className="text-[15px] text-foreground" />
                                            ) : null}

                                            {streaming && askStage && <StatusIndicator stage={askStage} since={askSince} />}
                                            {msg.error && !streaming && (
                                                <p className="flex items-start gap-2 text-sm text-destructive">
                                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {msg.error}
                                                </p>
                                            )}
                                            {msg.stopped && !streaming && !msg.bilingual && (
                                                <p className="text-xs text-subtle-foreground">
                                                    {msg.content ? "Stopped — the answer above is incomplete." : "Stopped before an answer was generated."}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <form
                                onSubmit={(e) => { e.preventDefault(); handleAsk(); }}
                                className="flex items-end gap-2 border-t border-border p-3"
                            >
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="e.g. What action should I take?"
                                    aria-label="Question about the document"
                                    className="min-w-0 flex-1 rounded-xl border border-border-strong bg-surface-2 px-3.5 py-2.5 text-sm text-foreground placeholder:text-subtle-foreground transition-colors focus:border-[#4a4f57] focus:outline-none"
                                />
                                {asking ? (
                                    <button
                                        type="button"
                                        onClick={() => askAbort.current?.abort()}
                                        aria-label="Stop"
                                        title="Stop"
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background active:scale-95"
                                    >
                                        <Square className="h-3.5 w-3.5 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={!question.trim()}
                                        aria-label="Ask"
                                        title="Ask"
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-all active:scale-95 disabled:bg-surface-3 disabled:text-subtle-foreground"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                )}
                            </form>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
