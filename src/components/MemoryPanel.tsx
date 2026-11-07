"use client";

import React, { useEffect, useRef } from "react";
import { Brain, Trash2, X } from "lucide-react";
import type { MemoryState } from "@/lib/memory";

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
  memory: MemoryState;
  onChange: (memory: MemoryState) => void;
  onClearAll: () => void;
  error?: string | null;
}

/** Shows what the app remembers about the user, with controls to remove it. */
export function MemoryPanel({ open, onClose, memory, onChange, onClearAll, error }: MemoryPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const remove = (index: number) => onChange({ ...memory, facts: memory.facts.filter((_, i) => i !== index) });

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="memory-title"
      className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 id="memory-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <Brain className="h-4 w-4 text-muted-foreground" /> Memory
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Sangati can remember a few things you tell it about yourself, like where you live or how you like answers,
          to give more relevant help. It never keeps ID numbers, phone numbers, health or other sensitive details. Only
          you can see this.
        </p>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
          <span>Remember things I tell you</span>
          <input
            type="checkbox"
            checked={memory.enabled}
            onChange={(e) => onChange({ ...memory, enabled: e.target.checked })}
            className="h-4 w-4 accent-current"
          />
        </label>

        {memory.facts.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-sm text-subtle-foreground">
            {memory.enabled ? "Nothing remembered yet." : "Memory is off."}
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {memory.facts.map((fact, i) => (
              <li key={`${i}-${fact}`} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">{fact}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Forget: ${fact}`}
                  title="Forget this"
                  className="shrink-0 rounded-lg p-1 text-subtle-foreground hover:bg-surface-3 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {memory.facts.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Forget everything
          </button>
        )}
      </div>
    </dialog>
  );
}
