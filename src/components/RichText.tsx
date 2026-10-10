"use client";

import React from "react";

const LIST_ITEM = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;
const CITATION = /(\[\d{1,2}\])/g;

interface RichTextProps {
  text: string;
  /** BCP 47 language of the text, e.g. "kok" for Konkani. */
  lang?: string;
  /** Number of sources; citations above this are shown as plain text. */
  sourceCount?: number;
  onCitation?: (id: number) => void;
  /** Show a blinking caret after the last character while streaming. */
  caret?: boolean;
  className?: string;
}

/**
 * Renders the backend's plain-text answers: paragraphs separated by blank
 * lines, "- " list items, and [n] citations as small clickable markers.
 */
export function RichText({ text, lang, sourceCount = 0, onCitation, caret = false, className = "" }: RichTextProps) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());

  const inline = (line: string, key: string) =>
    line.split(CITATION).map((part, i, parts) => {
      // "Goa [1]." -> "Goa" + marker + "." (the marker has its own spacing)
      const nextId = /^\[(\d{1,2})\]$/.exec(parts[i + 1] ?? "")?.[1];
      if (onCitation && nextId && Number(nextId) >= 1 && Number(nextId) <= sourceCount) part = part.replace(/\s+$/, "");
      const match = /^\[(\d{1,2})\]$/.exec(part);
      const id = match ? Number(match[1]) : 0;
      if (match && id >= 1 && id <= sourceCount && onCitation) {
        return (
          <button
            key={`${key}-${i}`}
            type="button"
            onClick={() => onCitation(id)}
            className="ml-1 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-md bg-surface-3 px-1 align-middle font-sans text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/20 hover:text-accent"
            aria-label={`Source ${id}`}
          >
            {id}
          </button>
        );
      }
      return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
    });

  const caretEl = caret ? <span className="streaming-caret" aria-hidden /> : null;

  if (blocks.length === 0) return caret ? <div className={className}>{caretEl}</div> : null;

  return (
    <div lang={lang} className={`prose-answer space-y-3 ${className}`}>
      {blocks.map((block, b) => {
        const isLast = b === blocks.length - 1;
        const lines = block.split("\n").filter((l) => l.trim());
        const groups: { list: boolean; lines: string[] }[] = [];
        for (const line of lines) {
          const list = LIST_ITEM.test(line);
          const last = groups[groups.length - 1];
          if (last && last.list === list) last.lines.push(line);
          else groups.push({ list, lines: [line] });
        }
        return (
          <React.Fragment key={b}>
            {groups.map((group, g) => {
              const lastGroup = isLast && g === groups.length - 1;
              if (group.list) {
                return (
                  <ul key={g} className="space-y-1.5 pl-1">
                    {group.lines.map((line, l) => (
                      <li key={l} className="flex gap-2.5">
                        <span aria-hidden className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                        <span className="min-w-0">
                          {inline(line.replace(LIST_ITEM, ""), `${b}-${g}-${l}`)}
                          {lastGroup && l === group.lines.length - 1 && caretEl}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={g}>
                  {group.lines.map((line, l) => (
                    <React.Fragment key={l}>
                      {l > 0 && <br />}
                      {inline(line, `${b}-${g}-${l}`)}
                    </React.Fragment>
                  ))}
                  {lastGroup && caretEl}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
