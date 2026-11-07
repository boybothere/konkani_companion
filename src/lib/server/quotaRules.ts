// Pure quota rules (no I/O), shared by the Firestore and in-memory stores.
// Kept free of path aliases so `node --test` can run its tests directly.

export type QuotaKind = "chat" | "document" | "voice" | "translate" | "memory";

export type UsageDay = {
  counts: Partial<Record<QuotaKind, number>>;
  /** Recent prompt fingerprints with timestamps (ms), newest last. */
  recent: { h: string; t: number }[];
};

export type QuotaLimits = Record<QuotaKind, number> & {
  /** Identical prompts allowed within `duplicateWindowMs`. */
  duplicateMax: number;
  duplicateWindowMs: number;
  /** An identical prompt sooner than this after the last one is a double submit. */
  resubmitMs: number;
};

export const DEFAULT_LIMITS: QuotaLimits = {
  chat: 150,
  document: 20,
  voice: 60,
  translate: 200,
  memory: 200,
  duplicateMax: 3,
  duplicateWindowMs: 10 * 60_000,
  resubmitMs: 5_000,
};

const RECENT_KEEP = 20;

const LABELS: Record<QuotaKind, string> = {
  chat: "questions",
  document: "documents",
  voice: "voice recordings",
  translate: "translations",
  memory: "memory updates",
};

export type Decision =
  | { ok: true; next: UsageDay }
  | { ok: false; status: 429; message: string; reason: "daily_limit" | "duplicate" };

/** Read limits from env (QUOTA_CHAT_PER_DAY, …). 0 means unlimited. */
export function limitsFromEnv(env: Record<string, string | undefined>): QuotaLimits {
  const num = (key: string, fallback: number) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && env[key]?.trim() !== "" && env[key] !== undefined ? Math.max(0, Math.floor(n)) : fallback;
  };
  return {
    chat: num("QUOTA_CHAT_PER_DAY", DEFAULT_LIMITS.chat),
    document: num("QUOTA_DOCUMENT_PER_DAY", DEFAULT_LIMITS.document),
    voice: num("QUOTA_VOICE_PER_DAY", DEFAULT_LIMITS.voice),
    translate: num("QUOTA_TRANSLATE_PER_DAY", DEFAULT_LIMITS.translate),
    memory: num("QUOTA_MEMORY_PER_DAY", DEFAULT_LIMITS.memory),
    duplicateMax: num("QUOTA_DUPLICATE_MAX", DEFAULT_LIMITS.duplicateMax),
    duplicateWindowMs: num("QUOTA_DUPLICATE_WINDOW_S", DEFAULT_LIMITS.duplicateWindowMs / 1000) * 1000,
    resubmitMs: DEFAULT_LIMITS.resubmitMs,
  };
}

/** The quota day in India (resets at midnight IST). */
export function dayKey(now: number): string {
  return new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Decide whether one more request of `kind` is allowed and return the updated
 * usage. `fingerprint` (a hash of the prompt) enables duplicate-prompt checks.
 */
export function decide(
  day: UsageDay | undefined,
  kind: QuotaKind,
  limits: QuotaLimits,
  now: number,
  fingerprint?: string,
): Decision {
  const usage: UsageDay = { counts: { ...(day?.counts ?? {}) }, recent: [...(day?.recent ?? [])] };
  const used = usage.counts[kind] ?? 0;
  const limit = limits[kind];
  if (limit > 0 && used >= limit) {
    return {
      ok: false,
      status: 429,
      reason: "daily_limit",
      message: `You've reached today's limit of ${limit} ${LABELS[kind]}. It resets at midnight (IST).`,
    };
  }

  if (fingerprint) {
    const same = usage.recent.filter((r) => r.h === fingerprint && now - r.t < limits.duplicateWindowMs);
    const last = same[same.length - 1];
    if (last && now - last.t < limits.resubmitMs) {
      return {
        ok: false,
        status: 429,
        reason: "duplicate",
        message: "That question was just sent. Please wait for the answer.",
      };
    }
    if (limits.duplicateMax > 0 && same.length >= limits.duplicateMax) {
      return {
        ok: false,
        status: 429,
        reason: "duplicate",
        message: "You've asked the same question several times. Try rephrasing it, or wait a few minutes.",
      };
    }
    usage.recent = [...usage.recent.filter((r) => now - r.t < limits.duplicateWindowMs), { h: fingerprint, t: now }].slice(
      -RECENT_KEEP,
    );
  }

  usage.counts[kind] = used + 1;
  return { ok: true, next: usage };
}

/** Normalise a prompt before hashing, so trivial edits count as the same prompt. */
export function normalisePrompt(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim().replace(/[\s?!.,।]+$/u, "");
}
