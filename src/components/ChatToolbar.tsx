"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, MoreHorizontal, Pencil, Printer, Share2 } from "lucide-react";
import type { Message } from "./ChatMessages";
import { download, fileNameFor, printChat, shareChat, toMarkdown } from "@/lib/chatExport";

type Action = "rename" | "copy" | "download" | "print" | "share";

const MENU: { id: Action; label: string; icon: typeof Copy }[] = [
  { id: "rename", label: "Rename", icon: Pencil },
  { id: "copy", label: "Copy conversation", icon: Copy },
  { id: "download", label: "Download (.md)", icon: Download },
  { id: "print", label: "Print / Save as PDF", icon: Printer },
  { id: "share", label: "Share…", icon: Share2 },
];

interface ChatToolbarProps {
  title: string;
  messages: Message[];
  onRename: (title: string) => void;
  /** Exporting while an answer streams would capture half an answer. */
  busy: boolean;
}

export function ChatToolbar({ title, messages, onRename, busy }: ChatToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 1800);
  };

  const startEditing = () => {
    setDraft(title);
    setEditing(true);
    setMenuOpen(false);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== title) onRename(draft);
  };

  const run = async (action: Action) => {
    setMenuOpen(false);
    if (action === "rename") return startEditing();
    const markdown = toMarkdown(title, messages);
    if (action === "copy") {
      await navigator.clipboard.writeText(markdown);
      flash("Copied");
    } else if (action === "download") {
      download(fileNameFor(title, "md"), markdown);
    } else if (action === "print") {
      if (!printChat(title, messages)) flash("Allow pop-ups to print");
    } else {
      const result = await shareChat(title, markdown);
      if (result === "copied") flash("Copied");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Chat name"
          className="min-w-0 max-w-sm flex-1 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1 text-sm text-foreground focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          title="Rename chat"
          className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <span className="truncate">{title}</span>
          <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
        </button>
      )}

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Chat options"
          title={busy ? "Available when the answer finishes" : "Chat options"}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
        >
          {notice ? <Check className="h-4 w-4 text-accent" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border-strong bg-card py-1 shadow-xl shadow-black/40 animate-fade-in"
          >
            {MENU.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => run(id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-2"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <span role="status" className="text-xs text-accent animate-fade-in">
          {notice}
        </span>
      )}
    </div>
  );
}
