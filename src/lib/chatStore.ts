// Per-user chat history.
// - localStorage: instant loading, namespaced by user id.
// - Firestore users/{uid}/chats/{chatId}: follows the user across devices.
//   Protected by firestore.rules so users can only read and write their own chats.

import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Message } from "@/components/ChatMessages";

export type SessionSummary = {
  id: string;
  /** User-chosen name, or the first question when the chat hasn't been renamed. */
  label: string;
  updatedAt: number;
  /** Search hits only: the text around the match. */
  snippet?: string;
};
type StoredChat = { messages: Message[]; preview: string; updatedAt: number; title?: string };

export const MAX_TITLE = 120; // matches firestore.rules

const PREFIX = (uid: string) => `kc:${uid}:chat:`;
const MAX_MESSAGES = 200; // matches firestore.rules

const previewOf = (messages: Message[]) =>
  (messages.find((m) => m.role === "user")?.content ?? "New chat").replace(/\s+/g, " ").slice(0, 60);

// Firestore rejects `undefined` values; a JSON round-trip drops them.
const clean = (messages: Message[]): Message[] => JSON.parse(JSON.stringify(messages.slice(-MAX_MESSAGES)));

const readLocal = (key: string): StoredChat | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.messages) ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocal = (uid: string, id: string, chat: StoredChat) => {
  try {
    localStorage.setItem(PREFIX(uid) + id, JSON.stringify(chat));
  } catch {
    // storage full or blocked: Firestore still has the chat
  }
};

export function loadLocal(uid: string, id: string): Message[] | null {
  return readLocal(PREFIX(uid) + id)?.messages ?? null;
}

const titleOf = (uid: string, id: string) => readLocal(PREFIX(uid) + id)?.title;

export function saveLocal(uid: string, id: string, messages: Message[]): void {
  const title = titleOf(uid, id);
  writeLocal(uid, id, { messages, preview: previewOf(messages), updatedAt: Date.now(), ...(title ? { title } : {}) });
}

export function getTitle(uid: string, id: string): string | undefined {
  return titleOf(uid, id);
}

/** Rename a chat locally and in Firestore. An empty title resets to the default name. */
export async function renameChat(uid: string, id: string, title: string): Promise<void> {
  const chat = readLocal(PREFIX(uid) + id);
  if (!chat) return;
  const clean = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  const { title: _old, ...rest } = chat; // eslint-disable-line @typescript-eslint/no-unused-vars
  writeLocal(uid, id, clean ? { ...rest, title: clean } : rest);
  await updateDoc(chatDoc(uid, id), { title: clean });
}

/** Search chat names and the full text of every message (this browser's cache). */
export function searchLocal(uid: string, rawQuery: string): SessionSummary[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return listLocal(uid);
  const prefix = PREFIX(uid);
  const out: SessionSummary[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const chat = readLocal(key);
    if (!chat || chat.messages.length === 0) continue;
    const label = chat.title || chat.preview;
    let snippet: string | undefined;
    if (!label.toLowerCase().includes(q)) {
      for (const m of chat.messages) {
        for (const text of [m.content, m.english ?? ""]) {
          const at = text.toLowerCase().indexOf(q);
          if (at >= 0) {
            const start = Math.max(0, at - 30);
            snippet = (start > 0 ? "…" : "") + text.slice(start, at + q.length + 50).replace(/\s+/g, " ").trim() + "…";
            break;
          }
        }
        if (snippet) break;
      }
      if (!snippet) continue;
    }
    out.push({ id: key.slice(prefix.length), label, updatedAt: chat.updatedAt ?? 0, snippet });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listLocal(uid: string): SessionSummary[] {
  const prefix = PREFIX(uid);
  const out: SessionSummary[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const chat = readLocal(key);
    if (chat && chat.messages.length > 0) {
      out.push({ id: key.slice(prefix.length), label: chat.title || chat.preview, updatedAt: chat.updatedAt ?? 0 });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeLocal(uid: string, id: string): void {
  localStorage.removeItem(PREFIX(uid) + id);
}

/** Remove this user's cached chats from this browser (on sign-out). Firestore keeps them. */
export function clearLocal(uid: string): void {
  const prefix = PREFIX(uid);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/**
 * Chats saved before sign-in existed (keys "chat_<id>") belong to whoever used
 * this browser; move them into the first account that signs in here.
 */
export function migrateLegacy(uid: string): string[] {
  const moved: string[] = [];
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("chat_")) legacy.push(key);
  }
  for (const key of legacy) {
    try {
      const messages = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(messages) && messages.length > 0) {
        const id = key.slice("chat_".length);
        saveLocal(uid, id, messages);
        moved.push(id);
      }
    } catch {
      // unreadable legacy entry: skip it
    }
    localStorage.removeItem(key);
  }
  return moved;
}

const chatDoc = (uid: string, id: string) => doc(db, "users", uid, "chats", id);

export async function saveRemote(uid: string, id: string, messages: Message[]): Promise<void> {
  const title = titleOf(uid, id);
  await setDoc(chatDoc(uid, id), {
    messages: clean(messages),
    preview: previewOf(messages),
    updatedAt: Date.now(),
    ...(title ? { title } : {}),
  });
}

export async function deleteRemote(uid: string, id: string): Promise<void> {
  await deleteDoc(chatDoc(uid, id));
}

/** Fetch the user's recent chats from Firestore into the local cache. */
export async function syncFromRemote(uid: string, max = 50): Promise<void> {
  const snapshot = await getDocs(query(collection(db, "users", uid, "chats"), orderBy("updatedAt", "desc"), limit(max)));
  snapshot.forEach((d) => {
    const data = d.data() as Partial<StoredChat>;
    if (!Array.isArray(data.messages)) return;
    const local = readLocal(PREFIX(uid) + d.id);
    // Keep whichever copy is newer.
    if (!local || (data.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
      writeLocal(uid, d.id, {
        messages: data.messages,
        preview: data.preview ?? previewOf(data.messages),
        updatedAt: data.updatedAt ?? 0,
        ...(data.title ? { title: data.title } : {}),
      });
    }
  });
}
