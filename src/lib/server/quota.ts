// Server-only: per-user daily quotas and duplicate-prompt protection.
// Only import this from Route Handlers.
//
// Usage is stored in Firestore at usage/{uid}/days/{YYYY-MM-DD} through the
// Admin SDK, which bypasses security rules; firestore.rules keeps that path
// closed to browsers, so users can't reset their own counts. Without
// FIREBASE_SERVICE_ACCOUNT_KEY it falls back to counting in this server
// process's memory (fine for local development, weak on serverless hosts).

import { createHash } from "node:crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { dayKey, decide, limitsFromEnv, normalisePrompt, type QuotaKind, type UsageDay } from "./quotaRules";

let db: Firestore | null | undefined;

function firestore(): Firestore | null {
  if (db !== undefined) return db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set: daily quotas are counted in memory only.");
    return (db = null);
  }
  try {
    // Accept the downloaded JSON as-is, or base64-encoded (easier to paste into hosting settings).
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const credentials = JSON.parse(json);
    const app: App =
      getApps().find((a) => a.name === "quota") ?? initializeApp({ credential: cert(credentials) }, "quota");
    db = getFirestore(app);
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY is invalid; counting quotas in memory instead.", err);
    db = null;
  }
  return db;
}

const memory = new Map<string, UsageDay>();

export const fingerprint = (...parts: string[]) =>
  createHash("sha256").update(parts.map(normalisePrompt).join("\u0000")).digest("hex").slice(0, 32);

/**
 * Count one request of `kind` for this user. Returns a 429 Response to send
 * back when the user is over their daily limit or repeating the same prompt,
 * or null when the request may go ahead.
 */
export async function checkQuota(uid: string, kind: QuotaKind, promptFingerprint?: string): Promise<Response | null> {
  const limits = limitsFromEnv(process.env);
  const now = Date.now();
  const day = dayKey(now);
  const store = firestore();

  let decision: ReturnType<typeof decide>;
  if (store) {
    try {
      const ref = store.collection("usage").doc(uid).collection("days").doc(day);
      decision = await store.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const result = decide(snap.exists ? (snap.data() as UsageDay) : undefined, kind, limits, now, promptFingerprint);
        if (result.ok) tx.set(ref, { ...result.next, updatedAt: now });
        return result;
      });
    } catch (err) {
      // Don't take the app down if Firestore is unavailable; fall back to memory.
      console.error("Quota check failed; using in-memory counting for this request.", err);
      decision = decideInMemory(uid, day, kind, now, promptFingerprint, limits);
    }
  } else {
    decision = decideInMemory(uid, day, kind, now, promptFingerprint, limits);
  }

  if (decision.ok) return null;
  return Response.json(
    { error: decision.message, reason: decision.reason },
    { status: decision.status, headers: { "Retry-After": decision.reason === "duplicate" ? "60" : "3600" } },
  );
}

function decideInMemory(
  uid: string,
  day: string,
  kind: QuotaKind,
  now: number,
  promptFingerprint: string | undefined,
  limits: ReturnType<typeof limitsFromEnv>,
) {
  const key = `${uid}:${day}`;
  const result = decide(memory.get(key), kind, limits, now, promptFingerprint);
  if (result.ok) {
    memory.set(key, result.next);
    if (memory.size > 5000) memory.delete(memory.keys().next().value!); // bound memory use
  }
  return result;
}
