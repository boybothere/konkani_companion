// Export and share a conversation: Markdown text, download, print / save as PDF, native share.
import type { Message } from "@/components/ChatMessages";

const ASSISTANT = "Konkani Companion";

const visible = (messages: Message[]) => messages.filter((m) => m.role !== "system" && (m.content || m.error));

export function toMarkdown(title: string, messages: Message[]): string {
  const lines = [`# ${title}`, "", `_Exported from ${ASSISTANT} on ${new Date().toLocaleString()}_`, ""];
  for (const m of visible(messages)) {
    if (m.role === "user") {
      lines.push(`**You:** ${m.content}`, "");
      continue;
    }
    lines.push(`**${ASSISTANT}:**`, "", m.content || `_${m.error}_`, "");
    if (m.english && m.english.trim() && m.english.trim() !== m.content.trim()) {
      lines.push("> **English:** " + m.english.trim().replace(/\n+/g, "\n> "), "");
    }
    if (m.sources?.length) {
      lines.push("Sources:");
      m.sources.forEach((s) => lines.push(`${s.id}. [${s.title || s.url}](${s.url})`));
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}

export function fileNameFor(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "konkani-companion-chat";
  return `${base}.${ext}`;
}

export function download(filename: string, text: string, type = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Opens a clean, printable page; the browser's print dialog can save it as PDF. */
export function printChat(title: string, messages: Message[]): boolean {
  const win = window.open("", "_blank");
  if (!win) return false; // pop-up blocked
  const blocks = visible(messages)
    .map((m) => {
      if (m.role === "user") return `<div class="msg user"><div class="who">You</div><p>${escapeHtml(m.content)}</p></div>`;
      const english =
        m.english && m.english.trim() !== m.content.trim()
          ? `<div class="english"><div class="who">English</div><p>${escapeHtml(m.english)}</p></div>`
          : "";
      const sources = m.sources?.length
        ? `<ol class="sources">${m.sources.map((s) => `<li>${escapeHtml(s.title || s.url)} — <span>${escapeHtml(s.url)}</span></li>`).join("")}</ol>`
        : "";
      return `<div class="msg"><div class="who">${ASSISTANT}</div><p lang="kok">${escapeHtml(m.content || m.error || "")}</p>${english}${sources}</div>`;
    })
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Noto Sans Devanagari", "Nirmala UI", "Mangal", system-ui, sans-serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 20px; line-height: 1.7; }
  h1 { font-size: 20px; margin: 0 0 4px; } .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .msg { margin: 0 0 20px; page-break-inside: avoid; } .who { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #666; margin-bottom: 2px; }
  .msg.user p { background: #f2f2f4; padding: 8px 12px; border-radius: 10px; }
  p { white-space: pre-wrap; margin: 0; } p[lang="kok"] { line-height: 1.85; }
  .english { margin-top: 8px; padding-left: 10px; border-left: 3px solid #ddd; color: #333; }
  .sources { font-size: 12px; color: #444; margin: 8px 0 0; padding-left: 18px; } .sources span { color: #777; word-break: break-all; }
</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">Exported from ${ASSISTANT} · ${escapeHtml(new Date().toLocaleString())}</div>${blocks}
<script>window.onload = () => { window.focus(); window.print(); };<\/script></body></html>`);
  win.document.close();
  return true;
}

/** Native share sheet where available (mostly phones); otherwise copies to the clipboard. */
export async function shareChat(title: string, text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
