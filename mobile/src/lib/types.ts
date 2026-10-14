// Same shapes as the web app, so chats stored in Firestore are shared between web and mobile.

export type Source = { id: number; title: string; url: string; provider?: string; snippet?: string };

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  english?: string; // English version, sent back to the backend as conversation context
  sources?: Source[];
  provider?: string | null;
  searched?: boolean;
  error?: string;
  stopped?: boolean;
};

export type SessionSummary = { id: string; label: string; updatedAt: number; snippet?: string };

export const hasDevanagari = (text: string) => /[ऀ-ॿ]/.test(text);
