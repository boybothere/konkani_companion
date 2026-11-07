// Client helpers for voice transcription and plain translation.
import { authFetch } from "@/lib/authFetch";

export type SpokenLanguage = "en" | "kok";
export type Direction = "kok2en" | "en2kok";

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  return new Error(typeof data.error === "string" ? data.error : fallback);
}

/** Speech -> text. `language` is the language being spoken. */
export async function transcribe(audio: Blob, language: SpokenLanguage, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "audio.webm");
  form.append("language", language);
  const res = await authFetch("/api/transcribe", { method: "POST", body: form, signal });
  if (!res.ok) throw await errorFrom(res, "Transcription failed. Please try again.");
  const data = await res.json().catch(() => ({}));
  return typeof data.text === "string" ? data.text.trim() : "";
}

/** English <-> Konkani with the project's own translation model. */
export async function translate(
  text: string,
  direction: Direction | "auto",
  signal?: AbortSignal,
): Promise<{ translation: string; direction: Direction }> {
  const res = await authFetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res, "Translation failed. Please try again.");
  return res.json();
}
