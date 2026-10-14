// Reader for the backend's server-sent events. Same logic as the web app's
// src/lib/sse.ts: buffers across network chunks so an event split over two
// reads is never lost.
import type { ApiResponse } from "./api";
import type { Source } from "./types";

export type CompanionEvent =
  | { type: "delta"; text: string }
  | { type: "englishDelta"; text: string }
  | { type: "status"; stage: string }
  | { type: "meta"; inputLanguage: string; queryEn: string }
  | { type: "sources"; sources: Source[]; provider: string | null }
  | { type: "english"; text: string }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

type RawEvent = { event: string; data: string };

async function* readSSE(res: ApiResponse): AsyncGenerator<RawEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        if (data.length) yield { event, data: data.join("\n") };
        event = "message";
        data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let val = colon === -1 ? "" : line.slice(colon + 1);
      if (val.startsWith(" ")) val = val.slice(1);
      if (field === "event") event = val;
      else if (field === "data") data.push(val);
    }

    if (done) {
      if (data.length) yield { event, data: data.join("\n") };
      return;
    }
  }
}

const isHttpUrl = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

export async function* readCompanionStream(res: ApiResponse): AsyncGenerator<CompanionEvent> {
  for await (const { event, data } of readSSE(res)) {
    if (data === "[DONE]") {
      yield { type: "done" };
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    switch (event) {
      case "message": {
        const text = payload?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield { type: "delta", text };
        break;
      }
      case "status":
        yield { type: "status", stage: String(payload?.stage ?? "") };
        break;
      case "meta":
        yield { type: "meta", inputLanguage: String(payload?.input_language ?? ""), queryEn: String(payload?.query_en ?? "") };
        break;
      case "sources":
        yield {
          type: "sources",
          sources: (Array.isArray(payload?.sources) ? payload.sources : []).filter((s: Source) => isHttpUrl(s?.url)),
          provider: typeof payload?.provider === "string" ? payload.provider : null,
        };
        break;
      case "english_delta":
        if (typeof payload === "string") yield { type: "englishDelta", text: payload };
        break;
      case "english":
        yield { type: "english", text: String(payload?.text ?? "") };
        break;
      case "result":
        yield { type: "result", data: payload };
        break;
      case "error":
        yield { type: "error", message: String(payload?.message ?? "Something went wrong.") };
        break;
    }
  }
}

// The stages the backend reports, with the same wording as the website.
export const STATUS_LABELS: Record<string, string> = {
  starting: "Sending your question…",
  uploading: "Uploading your document…",
  understanding: "Translating your question…",
  searching: "Searching the web…",
  thinking: "Generating your answer…",
  translating: "Translating the response…",
  extracting: "Processing your document…",
  processing: "Processing your document…",
  translating_document: "Translating the document…",
  summarizing: "Preparing your summaries…",
  transcribing: "Transcribing your voice…",
};
