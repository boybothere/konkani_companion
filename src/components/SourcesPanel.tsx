"use client";

import { ChevronDown, Globe, ExternalLink } from "lucide-react";
import type { Source } from "@/lib/sse";

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const PROVIDER_NAMES: Record<string, string> = {
  firecrawl: "Firecrawl",
  tavily: "Tavily",
  duckduckgo: "DuckDuckGo",
};

interface SourcesPanelProps {
  sources: Source[];
  provider?: string | null;
  open: boolean;
  onToggle: () => void;
  /** Source to highlight after a citation click. */
  highlightId?: number | null;
  idPrefix: string;
}

export function SourcesPanel({ sources, provider, open, onToggle, highlightId, idPrefix }: SourcesPanelProps) {
  if (sources.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-subtle-foreground">
        <Globe className="h-3.5 w-3.5" />
        No web results were found, so this answer is based on general knowledge.
      </p>
    );
  }

  const hosts = Array.from(new Set(sources.map((s) => hostname(s.url)))).slice(0, 3);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
      >
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">Sources &amp; Search Results</span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {sources.length}
        </span>
        <span className="ml-auto hidden min-w-0 truncate text-xs text-subtle-foreground sm:block">
          {hosts.join(" · ")}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 sm:ml-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="collapsible" data-open={open}>
        <div inert={!open}>
          <ol className="divide-y divide-border border-t border-border">
            {sources.map((source) => (
              <li
                key={source.id}
                id={`${idPrefix}-${source.id}`}
                className={`flex gap-3 px-3.5 py-3 transition-colors duration-500 ${
                  highlightId === source.id ? "bg-accent/10" : ""
                }`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-3 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {source.id}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group inline-flex max-w-full items-start gap-1 text-sm font-medium text-foreground hover:text-accent"
                  >
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">{source.title || hostname(source.url)}</span>
                    <ExternalLink className="mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                  </a>
                  <div className="truncate text-xs text-subtle-foreground">{hostname(source.url)}</div>
                  {source.snippet && (
                    <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                      {source.snippet}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {provider && PROVIDER_NAMES[provider] && (
            <p className="border-t border-border px-3.5 py-2 text-[11px] text-subtle-foreground">
              Results via {PROVIDER_NAMES[provider]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
