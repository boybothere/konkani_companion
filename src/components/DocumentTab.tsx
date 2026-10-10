"use client";

import React, { useState, useRef } from "react";
import { Upload, FileText, MessageSquare, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { readCompanionStream } from "@/lib/sse";

interface AnalysisResult {
    ocr_text: string;
    english_translation: string;
    summary: string;
    error: boolean;
    pages?: number;
    method?: "pdf-text" | "ocr" | "mixed";
    truncated?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
    "pdf-text": "text read directly from the PDF",
    ocr: "text read with OCR",
    mixed: "PDF text + OCR",
};

interface DocMessage {
    role: "user" | "assistant";
    content: string;
}

export default function DocumentTab() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [showOCR, setShowOCR] = useState(false);
    const [showTranslation, setShowTranslation] = useState(false);

    const [docMessages, setDocMessages] = useState<DocMessage[]>([]);
    const [question, setQuestion] = useState("");
    const [isAsking, setIsAsking] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // ── File selection ──────────────────────────────────────────
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setResult(null);
        setDocMessages([]);

        if (f.type.startsWith("image/")) {
            const url = URL.createObjectURL(f);
            setPreview(url);
        } else {
            setPreview(null); // PDF — no preview
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        setFile(f);
        setResult(null);
        setDocMessages([]);
        if (f.type.startsWith("image/")) {
            setPreview(URL.createObjectURL(f));
        } else {
            setPreview(null);
        }
    };

    // ── Analyze document ────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!file) return;
        setIsAnalyzing(true);
        setResult(null);
        setDocMessages([]);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/analyze-document", {
                method: "POST",
                body: formData,
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error("analyze-document error:", res.status, data);
                throw new Error(data.error || "Failed to analyze document.");
            }
            if (typeof data.summary !== "string") throw new Error("The server returned an unexpected response.");
            setResult(data as AnalysisResult);
        } catch (err) {
            console.error(err);
            setResult({
                ocr_text: "",
                english_translation: "",
                summary: err instanceof Error ? err.message : "Failed to analyze document.",
                error: true,
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // ── Document Q&A ────────────────────────────────────────────
    const handleAskQuestion = async () => {
        if (!question.trim() || isAsking || !result?.english_translation) return;

        const userMsg: DocMessage = { role: "user", content: question };
        setDocMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
        setQuestion("");
        setIsAsking(true);

        let answer = "";
        const setAnswer = (content: string) =>
            setDocMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content };
                return updated;
            });

        try {
            const res = await fetch("/api/document-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: question,
                    document_context: result.english_translation,
                }),
            });

            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Error getting answer.");
            }

            let finished = false;
            for await (const event of readCompanionStream(res)) {
                if (event.type === "delta") {
                    answer += event.text;
                    setAnswer(answer);
                } else if (event.type === "error") {
                    answer = answer ? `${answer}\n\n⚠ ${event.message}` : event.message;
                    setAnswer(answer);
                } else if (event.type === "done") {
                    finished = true;
                }
            }
            if (!finished) setAnswer(`${answer}\n\n⚠ The answer was cut off. Please try again.`.trim());
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : "Error getting answer.";
            setAnswer(answer ? `${answer}\n\n⚠ ${message}` : message);
        } finally {
            setIsAsking(false);
            setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full gap-6">

            {/* ── Upload zone ── */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-colors"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                />
                {preview ? (
                    <img src={preview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : file ? (
                    <div className="flex flex-col items-center gap-2 text-gray-300">
                        <FileText size={40} className="text-blue-400" />
                        <span className="text-sm">{file.name}</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                        <Upload size={36} />
                        <p className="text-sm">Drop a Konkani document here or click to upload</p>
                        <p className="text-xs text-gray-500">Supports JPG, PNG, PDF — printed Devanagari works best</p>
                    </div>
                )}
            </div>

            {/* ── Analyze button ── */}
            {file && !result && (
                <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl py-3 px-6 font-medium transition-colors"
                >
                    {isAnalyzing ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            Analyzing document... this may take a minute
                        </>
                    ) : (
                        <>
                            <FileText size={18} />
                            Analyze Document
                        </>
                    )}
                </button>
            )}

            {/* ── Results ── */}
            {result && (
                <div className="flex flex-col gap-4">

                    {/* Error state */}
                    {result.error && (
                        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            <p className="text-sm">{result.summary}</p>
                        </div>
                    )}

                    {/* Summary card */}
                    {!result.error && (
                        <div className="bg-[#2f2f2f] border border-gray-700 rounded-2xl p-5">
                            <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                                <FileText size={16} /> Document Summary
                            </h3>
                            <p className="text-gray-200 text-sm whitespace-pre-line leading-relaxed">{result.summary}</p>
                            {(result.method || result.truncated) && (
                                <p className="mt-3 text-xs text-gray-500">
                                    {result.pages ? `${result.pages} page${result.pages > 1 ? "s" : ""}` : ""}
                                    {result.method ? ` · ${METHOD_LABELS[result.method] ?? result.method}` : ""}
                                    {result.truncated ? " · only the first part of the document was processed" : ""}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Collapsible: Full English Translation */}
                    {!result.error && result.english_translation && (
                        <div className="bg-[#2f2f2f] border border-gray-700 rounded-2xl overflow-hidden">
                            <button
                                onClick={() => setShowTranslation(!showTranslation)}
                                className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-300 hover:text-white"
                            >
                                <span className="font-medium">Full English Translation</span>
                                {showTranslation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {showTranslation && (
                                <div className="px-5 pb-5 text-gray-300 text-sm whitespace-pre-line leading-relaxed border-t border-gray-700 pt-4">
                                    {result.english_translation}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Collapsible: Raw OCR text */}
                    {!result.error && result.ocr_text && (
                        <div className="bg-[#2f2f2f] border border-gray-700 rounded-2xl overflow-hidden">
                            <button
                                onClick={() => setShowOCR(!showOCR)}
                                className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-300 hover:text-white"
                            >
                                <span className="font-medium">Raw Extracted Text (Devanagari)</span>
                                {showOCR ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {showOCR && (
                                <div className="px-5 pb-5 text-gray-400 text-sm whitespace-pre-line leading-relaxed border-t border-gray-700 pt-4 font-mono">
                                    {result.ocr_text}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Document Q&A ── */}
                    {!result.error && (
                        <div className="bg-[#2f2f2f] border border-gray-700 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-2 text-blue-400 font-semibold text-sm">
                                <MessageSquare size={16} /> Ask about this document
                            </div>

                            {/* Chat history */}
                            <div className="px-5 py-4 flex flex-col gap-3 max-h-72 overflow-y-auto">
                                {docMessages.length === 0 && (
                                    <p className="text-gray-500 text-sm text-center py-4">
                                        Ask anything about the document — answers will be in Konkani
                                    </p>
                                )}
                                {docMessages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`text-sm px-4 py-3 rounded-xl whitespace-pre-wrap leading-relaxed max-w-[90%] ${msg.role === "user"
                                            ? "bg-blue-600/20 text-blue-100 self-end"
                                            : "bg-gray-700/50 text-gray-200 self-start"
                                            }`}
                                    >
                                        {msg.content || <span className="animate-pulse text-gray-500">...</span>}
                                    </div>
                                ))}
                                <div ref={chatBottomRef} />
                            </div>

                            {/* Question input */}
                            <div className="px-4 pb-4 flex gap-2">
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
                                    placeholder="e.g. What action should I take?"
                                    className="flex-1 bg-[#1a1a1a] border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={handleAskQuestion}
                                    disabled={isAsking || !question.trim()}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                                >
                                    {isAsking ? <Loader2 size={16} className="animate-spin" /> : "Ask"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Analyze another */}
                    <button
                        onClick={() => { setFile(null); setPreview(null); setResult(null); setDocMessages([]); }}
                        className="text-gray-500 hover:text-gray-300 text-sm text-center transition-colors"
                    >
                        ← Analyze another document
                    </button>
                </div>
            )}
        </div>
    );
}