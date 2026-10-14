// Per-user chat history, the same model as the web app's src/lib/chatStore.ts:
// - AsyncStorage cache for instant loading (namespaced by user id),
// - Firestore users/{uid}/chats/{chatId} (protected by firestore.rules), so
//   chats follow the user between the website and the phone.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Message, SessionSummary } from "./types";

type StoredChat = { messages: Message[]; preview: string; updatedAt: number; title?: string };

export const MAX_TITLE = 120; // matches firestore.rules
const MAX_MESSAGES = 200; // matches firestore.rules
const prefix = (uid: string) => `kc:${uid}:chat:`;

const previewOf = (messages: Message[]) =>
  (messages.find((m) => m.role === "user")?.content ?? "New chat").replace(/\s+/g, " ").slice(0, 60);

// Firestore rejects `undefined` values; a JSON round-trip drops them.
const clean = (messages: Message[]): Message[] => JSON.parse(JSON.stringify(messages.slice(-MAX_MESSAGES)));

/** In-memory copy of one user's chats, loaded once and written through to AsyncStorage. */
class ChatStore {
  private chats = new Map<string, StoredChat>();
  private loadedFor: string | null = null;

  async load(uid: string): Promise<void> {
    if (this.loadedFor === uid) return;
    this.chats.clear();
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix(uid)));
    for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
      try {
        const chat = raw ? (JSON.parse(raw) as StoredChat) : null;
        if (chat && Array.isArray(chat.messages)) this.chats.set(key.slice(prefix(uid).length), chat);
      } catch {
        // unreadable entry: skip it
      }
    }
    this.loadedFor = uid;
  }

  private persist(uid: string, id: string) {
    const chat = this.chats.get(id);
    const key = prefix(uid) + id;
    (chat ? AsyncStorage.setItem(key, JSON.stringify(chat)) : AsyncStorage.removeItem(key)).catch(() => {});
  }

  messages(id: string): Message[] {
    return this.chats.get(id)?.messages ?? [];
  }

  title(id: string): string | undefined {
    return this.chats.get(id)?.title;
  }

  list(): SessionSummary[] {
    return [...this.chats.entries()]
      .filter(([, c]) => c.messages.length > 0)
      .map(([id, c]) => ({ id, label: c.title || c.preview, updatedAt: c.updatedAt ?? 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Search chat names and the full text of every message. */
  search(rawQuery: string): SessionSummary[] {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return this.list();
    const out: SessionSummary[] = [];
    for (const [id, chat] of this.chats) {
      if (chat.messages.length === 0) continue;
      const label = chat.title || chat.preview;
      let snippet: string | undefined;
      if (!label.toLowerCase().includes(q)) {
        outer: for (const m of chat.messages) {
          for (const text of [m.content, m.english ?? ""]) {
            const at = text.toLowerCase().indexOf(q);
            if (at >= 0) {
              const start = Math.max(0, at - 30);
              snippet = (start > 0 ? "…" : "") + text.slice(start, at + q.length + 50).replace(/\s+/g, " ").trim() + "…";
              break outer;
            }
          }
        }
        if (!snippet) continue;
      }
      out.push({ id, label, updatedAt: chat.updatedAt ?? 0, snippet });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  save(uid: string, id: string, messages: Message[]) {
    const title = this.chats.get(id)?.title;
    this.chats.set(id, { messages, preview: previewOf(messages), updatedAt: Date.now(), ...(title ? { title } : {}) });
    this.persist(uid, id);
  }

  async saveRemote(uid: string, id: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    await setDoc(doc(db, "users", uid, "chats", id), {
      messages: clean(chat.messages),
      preview: chat.preview,
      updatedAt: chat.updatedAt,
      ...(chat.title ? { title: chat.title } : {}),
    });
  }

  async rename(uid: string, id: string, rawTitle: string) {
    const chat = this.chats.get(id);
    if (!chat) return;
    const title = rawTitle.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
    const { title: _old, ...rest } = chat;
    this.chats.set(id, title ? { ...rest, title } : rest);
    this.persist(uid, id);
    await updateDoc(doc(db, "users", uid, "chats", id), { title });
  }

  async remove(uid: string, id: string) {
    this.chats.delete(id);
    this.persist(uid, id);
    await deleteDoc(doc(db, "users", uid, "chats", id));
  }

  /** Pull the user's recent chats from Firestore; keeps whichever copy is newer. */
  async syncFromRemote(uid: string, max = 50) {
    const snapshot = await getDocs(query(collection(db, "users", uid, "chats"), orderBy("updatedAt", "desc"), limit(max)));
    snapshot.forEach((d) => {
      const data = d.data() as Partial<StoredChat>;
      if (!Array.isArray(data.messages)) return;
      const local = this.chats.get(d.id);
      if (!local || (data.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        this.chats.set(d.id, {
          messages: data.messages,
          preview: data.preview ?? previewOf(data.messages),
          updatedAt: data.updatedAt ?? 0,
          ...(data.title ? { title: data.title } : {}),
        });
        this.persist(uid, d.id);
      }
    });
  }

  /** Remove this user's cached chats from the device (on sign-out). Firestore keeps them. */
  async clear(uid: string) {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix(uid)));
    await AsyncStorage.multiRemove(keys);
    this.chats.clear();
    this.loadedFor = null;
  }
}

export const chatStore = new ChatStore();
