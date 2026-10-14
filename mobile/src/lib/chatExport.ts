// Export and share a conversation: the same Markdown format as the website,
// plus native PDF generation and the system share sheet.
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import type { Message } from "./types";

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

const fileName = (title: string, ext: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "konkani-companion-chat"}.${ext}`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toHtml(title: string, messages: Message[]): string {
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
      return `<div class="msg"><div class="who">${ASSISTANT}</div><p>${escapeHtml(m.content || m.error || "")}</p>${english}${sources}</div>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  body { font-family: "Noto Sans Devanagari", sans-serif; color: #111; margin: 32px; line-height: 1.75; }
  h1 { font-size: 20px; margin: 0 0 4px; } .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .msg { margin: 0 0 18px; page-break-inside: avoid; } .who { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #666; }
  .msg.user p { background: #f2f2f4; padding: 8px 12px; border-radius: 10px; } p { white-space: pre-wrap; margin: 0; }
  .english { margin-top: 8px; padding-left: 10px; border-left: 3px solid #ddd; color: #333; }
  .sources { font-size: 12px; color: #444; padding-left: 18px; } .sources span { color: #777; word-break: break-all; }
  </style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">Exported from ${ASSISTANT} · ${escapeHtml(new Date().toLocaleString())}</div>${blocks}</body></html>`;
}

export async function copyChat(title: string, messages: Message[]) {
  await Clipboard.setStringAsync(toMarkdown(title, messages));
}

/** The system share sheet with the conversation as text. */
export async function shareChat(title: string, messages: Message[]) {
  await Share.share({ title, message: toMarkdown(title, messages) });
}

/** A Markdown file, shared through the system sheet (save to Files, Drive, ...). */
export async function shareMarkdownFile(title: string, messages: Message[]) {
  const file = new File(Paths.cache, fileName(title, "md"));
  if (file.exists) file.delete();
  file.create();
  file.write(toMarkdown(title, messages));
  await Sharing.shareAsync(file.uri, { mimeType: "text/markdown", dialogTitle: title, UTI: "net.daringfireball.markdown" });
}

/** A PDF generated on the device, shared through the system sheet. */
export async function sharePdf(title: string, messages: Message[]) {
  const { uri } = await Print.printToFileAsync({ html: toHtml(title, messages) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
}
