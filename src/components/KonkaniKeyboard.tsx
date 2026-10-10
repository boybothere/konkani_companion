"use client";

import { useState } from "react";

const ROWS = [
    { label: "स्वर", chars: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "अं", "अः"] },
    { label: "मात्रा", chars: ["ा", "ि", "ी", "ु", "ू", "े", "ै", "ो", "ौ", "ं", "ः", "्"] },
    { label: "क–ज", chars: ["क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ"] },
    { label: "ट–न", chars: ["ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न"] },
    { label: "प–ह", chars: ["प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह"] },
    { label: "विशेष", chars: ["ळ", "क्ष", "ज्ञ", "त्र", "श्र", "ँ", "ऱ", "।", "॥", "ॐ"] },
];

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
                type="button"
                onClick={() => setIsOpen(v => !v)}
                aria-expanded={isOpen}
                className={`mb-2 inline-flex h-7 select-none items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors ${isOpen
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
                    }`}
            >
                <span lang="kok" className="devanagari text-[15px] leading-none">क</span>
                <span>Konkani keyboard</span>
                <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▼</span>
            </button>

            <div className="collapsible" data-open={isOpen}>
                <div inert={!isOpen}>
                    <div className="mb-3 w-full overflow-hidden rounded-2xl border border-border bg-card">

                        {/* Category tabs */}
                        <div className="flex overflow-x-auto border-b border-border">
                            {ROWS.map((row, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setActiveTab(i)}
                                    lang="kok"
                                    className={`devanagari shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-[13px] transition-colors ${activeTab === i
                                        ? "border-accent text-foreground"
                                        : "border-transparent text-subtle-foreground hover:text-muted-foreground"
                                        }`}
                                >
                                    {row.label}
                                </button>
                            ))}
                        </div>

                        {/* Character grid */}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2 p-3 sm:grid-cols-[repeat(auto-fill,minmax(54px,1fr))]">
                            {ROWS[activeTab].chars.map(char => (
                                <button
                                    key={char}
                                    type="button"
                                    onClick={() => fire(char)}
                                    lang="kok"
                                    className={`devanagari h-12 select-none rounded-xl border text-[21px] leading-none transition-colors duration-75 active:scale-95 sm:h-[52px] ${flash === char
                                        ? "border-accent bg-accent/20 text-foreground"
                                        : "border-border-strong bg-surface-2 text-foreground hover:bg-surface-3"
                                        }`}
                                >
                                    {char}
                                </button>
                            ))}
                        </div>

                        {/* Action row */}
                        <div className="flex gap-2 px-3 pb-3">
                            <button
                                type="button"
                                onClick={() => fire("⌫")}
                                className="h-10 flex-1 rounded-xl border border-border-strong bg-surface-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                            >
                                ⌫ Delete
                            </button>
                            <button
                                type="button"
                                onClick={() => fire("SP")}
                                className="h-10 flex-[2.5] rounded-xl border border-border-strong bg-surface-2 text-sm text-muted-foreground transition-colors hover:bg-surface-3"
                            >
                                Space
                            </button>
                            <button
                                type="button"
                                onClick={() => fire("↵")}
                                className="h-10 flex-1 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
                            >
                                Send ↵
                            </button>
                        </div>

                        <p lang="kok" className="devanagari pb-2.5 text-center text-xs text-subtle-foreground">
                            क + ा = का &nbsp;·&nbsp; consonant first, then मात्रा tab
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
