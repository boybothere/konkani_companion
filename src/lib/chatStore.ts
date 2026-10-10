// Per-user chat history.
// - localStorage: instant loading, namespaced by user id.
// - Firestore users/{uid}/chats/{chatId}: follows the user across devices.
//   Protected by firestore.rules so users can only read and write their own chats.

import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Message } from "@/components/ChatMessages";

export type SessionSummary = { id: string; preview: string; updatedAt: number };
type StoredChat = { messages: Message[]; preview: string; updatedAt: number };

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

export function saveLocal(uid: string, id: string, messages: Message[]): void {
  writeLocal(uid, id, { messages, preview: previewOf(messages), updatedAt: Date.now() });
}

export function listLocal(uid: string): SessionSummary[] {
  const prefix = PREFIX(uid);
  const out: SessionSummary[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const chat = readLocal(key);
    if (chat && chat.messages.length > 0) {
      out.push({ id: key.slice(prefix.length), preview: chat.preview, updatedAt: chat.updatedAt ?? 0 });
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
  await setDoc(chatDoc(uid, id), { messages: clean(messages), preview: previewOf(messages), updatedAt: Date.now() });
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
      });
    }
  });
}
