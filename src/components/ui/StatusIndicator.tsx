"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/sse";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent ${className}`}
    />
  );
}

interface StatusIndicatorProps {
  stage: string;
  /** When the operation started (ms). Elapsed time is shown after a few seconds. */
  since?: number | null;
  className?: string;
}

/** Shows the stage the backend last reported. It never advances on its own. */
export function StatusIndicator({ stage, since, className = "" }: StatusIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const label = STATUS_LABELS[stage] ?? "Working…";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[13px] text-muted-foreground ${className}`}
    >
      <Spinner />
      <span key={stage} className="animate-fade-in">{label}</span>
      {seconds >= 5 && <span className="tabular-nums text-subtle-foreground">{seconds}s</span>}
    </div>
  );
}
