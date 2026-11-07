// Per-user memory: short facts the user lets the app remember, stored in their
// own Firestore document (users/{uid}/profile/memory). Only the owner can read
// or change it (see firestore.rules); the user sees and clears it in the
// Memory panel.

import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";

export type MemoryState = { facts: string[]; enabled: boolean };

export const EMPTY_MEMORY: MemoryState = { facts: [], enabled: true };
const MAX_FACTS = 12; // matches firestore.rules and the backend

const ref = (uid: string) => doc(db, "users", uid, "profile", "memory");

export async function loadMemory(uid: string): Promise<MemoryState> {
  const snap = await getDoc(ref(uid));
  if (!snap.exists()) return EMPTY_MEMORY;
  const data = snap.data();
  return {
    facts: Array.isArray(data.facts) ? data.facts.filter((f): f is string => typeof f === "string").slice(0, MAX_FACTS) : [],
    enabled: data.enabled !== false,
  };
}

export async function saveMemory(uid: string, memory: MemoryState): Promise<void> {
  await setDoc(ref(uid), { facts: memory.facts.slice(0, MAX_FACTS), enabled: memory.enabled, updatedAt: Date.now() });
}

export async function clearMemory(uid: string): Promise<void> {
  await deleteDoc(ref(uid));
}

// Only ask the model to update memory when the user may have said something
// about themselves; this keeps the extra AI call (and its cost) rare.
const SELF_REFERENCE = /\b(i|i'm|im|i've|i'd|my|me|mine|myself|we|our|us)\b|(मी|हांव|म्हजो|म्हजी|म्हजें|म्हाका|आमी|आमचो|आमची|आमचें)/i;

export function mightContainPersonalInfo(textEn: string, original: string): boolean {
  return SELF_REFERENCE.test(textEn) || SELF_REFERENCE.test(original);
}

/** Ask the server for the updated memory after an exchange (English versions). */
export async function proposeMemory(facts: string[], question: string, answer: string): Promise<string[] | null> {
  const res = await authFetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts, question, answer }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.facts) ? data.facts.filter((f: unknown): f is string => typeof f === "string") : null;
}

export const sameFacts = (a: string[], b: string[]) => a.length === b.length && a.every((f, i) => f === b[i]);
