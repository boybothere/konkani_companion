"use client";

import React, { useState } from "react";

const ROWS = [
    { label: "स्वर", chars: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "अं", "अः"] },
    { label: "मात्रा", chars: ["ा", "ि", "ी", "ु", "ू", "े", "ै", "ो", "ौ", "ं", "ः", "्"] },
    { label: "क–ज", chars: ["क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ"] },
    { label: "ट–न", chars: ["ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न"] },
    { label: "प–ह", chars: ["प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह"] },
    { label: "विशेष", chars: ["ळ", "क्ष", "ज्ञ", "त्र", "श्र", "ँ", "ऱ", "।", "॥", "ॐ"] },
];

// System font stack that guarantees Devanagari rendering on every OS
// Windows: Mangal / Nirmala UI
// macOS/iOS: Kohinoor Devanagari / ITF Devanagari
// Android: Noto Sans Devanagari (built-in)
// Linux: Lohit Devanagari
const DEV_FONT: React.CSSProperties = {
    fontFamily:
        "'Kohinoor Devanagari', 'Nirmala UI', 'Mangal', 'Noto Sans Devanagari', " +
        "'ITF Devanagari', 'Lohit Devanagari', Arial Unicode MS, sans-serif",
    fontWeight: 600,
};

interface Props {
    onInsert: (char: string) => void;
    onBackspace: () => void;
    onEnter: () => void;
}

export default function KonkaniKeyboard({ onInsert, onBackspace, onEnter }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [flash, setFlash] = useState<string | null>(null);

    const fire = (char: string) => {
        setFlash(char);
        setTimeout(() => setFlash(null), 120);
        if (char === "⌫") return onBackspace();
        if (char === "SP") return onInsert(" ");
        if (char === "↵") return onEnter();
        onInsert(char);
    };

    return (
        <div className="w-full">
            {/* Trigger */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className={`
          inline-flex items-center gap-2 h-7 px-3 mb-2 rounded-md text-xs font-medium
          border transition-all select-none
          ${isOpen
                        ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                        : "bg-transparent border-gray-600 text-gray-500 hover:text-amber-300 hover:border-amber-500/40"
                    }
        `}
            >
                <span style={{ ...DEV_FONT, fontSize: 16 }}>क</span>
                <span>Konkani keyboard {isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
                <div className="w-full mb-3 bg-[#1a1a1a] border border-gray-700/60 rounded-2xl overflow-hidden">

                    {/* Category tabs */}
                    <div className="flex border-b border-gray-700/50 bg-[#141414] overflow-x-auto">
                        {ROWS.map((row, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveTab(i)}
                                style={{ ...DEV_FONT, fontSize: 13 }}
                                className={`
                  flex-shrink-0 px-4 py-2.5 transition-colors whitespace-nowrap
                  ${activeTab === i
                                        ? "text-amber-300 border-b-2 border-amber-400 bg-[#1a1a1a]"
                                        : "text-gray-500 hover:text-gray-300"
                                    }
                `}
                            >
                                {row.label}
                            </button>
                        ))}
                    </div>

                    {/* Character grid */}
                    <div
                        className="p-4"
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
                            gap: "10px",
                        }}
                    >
                        {ROWS[activeTab].chars.map(char => (
                            <button
                                key={char}
                                onClick={() => fire(char)}
                                style={{
                                    ...DEV_FONT,
                                    fontSize: 22,
                                    lineHeight: 1,
                                    color: flash === char ? "#000" : "#111827",
                                    backgroundColor: flash === char ? "#fbbf24" : "#ffffff",
                                }}
                                className="h-14 rounded-xl select-none transition-all duration-75 active:scale-95 hover:brightness-95"
                            >
                                {char}
                            </button>
                        ))}
                    </div>

                    {/* Action row */}
                    <div className="flex gap-2.5 px-4 pb-4">
                        <button
                            onClick={() => fire("⌫")}
                            className="flex-1 h-11 rounded-xl text-sm font-medium bg-[#2a2a2a] text-gray-300 border border-gray-700 hover:bg-red-950/60 hover:text-red-300 hover:border-red-800 transition-colors"
                        >
                            ⌫ Delete
                        </button>
                        <button
                            onClick={() => fire("SP")}
                            className="flex-[2.5] h-11 rounded-xl text-sm font-medium bg-[#2a2a2a] text-gray-300 border border-gray-700 hover:bg-[#333] transition-colors"
                        >
                            Space
                        </button>
                        <button
                            onClick={() => fire("↵")}
                            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                        >
                            Send ↵
                        </button>
                    </div>

                    <p
                        className="text-center pb-3 text-gray-500"
                        style={{ ...DEV_FONT, fontSize: 12 }}
                    >
                        क + ा = का &nbsp;·&nbsp; consonant first, then मात्रा tab
                    </p>
                </div>
            )}
        </div>
    );
}