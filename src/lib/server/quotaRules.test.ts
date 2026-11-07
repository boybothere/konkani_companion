import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS, dayKey, decide, limitsFromEnv, normalisePrompt, type UsageDay } from "./quotaRules.ts";

const T0 = Date.UTC(2026, 10, 7, 6, 0, 0);

test("allows requests up to the daily limit, then refuses", () => {
  const limits = { ...DEFAULT_LIMITS, chat: 3 };
  let day: UsageDay | undefined;
  for (let i = 0; i < 3; i++) {
    const d = decide(day, "chat", limits, T0 + i * 60_000);
    assert.equal(d.ok, true);
    if (d.ok) day = d.next;
  }
  const blocked = decide(day, "chat", limits, T0 + 10 * 60_000);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.reason, "daily_limit");
    assert.match(blocked.message, /limit of 3 questions/);
  }
});

test("limits are per kind and 0 means unlimited", () => {
  const limits = { ...DEFAULT_LIMITS, chat: 1, document: 0 };
  const first = decide(undefined, "chat", limits, T0);
  assert.ok(first.ok);
  const day = first.ok ? first.next : undefined;
  assert.equal(decide(day, "chat", limits, T0).ok, false);
  assert.equal(decide(day, "voice", limits, T0).ok, true);
  let docDay = day;
  for (let i = 0; i < 500; i++) {
    const d = decide(docDay, "document", limits, T0);
    assert.ok(d.ok);
    if (d.ok) docDay = d.next;
  }
});

test("blocks an immediate resubmit of the same prompt", () => {
  const first = decide(undefined, "chat", DEFAULT_LIMITS, T0, "abc");
  assert.ok(first.ok);
  const again = decide(first.ok ? first.next : undefined, "chat", DEFAULT_LIMITS, T0 + 1_000, "abc");
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.message, /just sent/);
  // A different prompt is fine.
  assert.equal(decide(first.ok ? first.next : undefined, "chat", DEFAULT_LIMITS, T0 + 1_000, "xyz").ok, true);
});

test("caps repeats of the same prompt within the window, then allows it again", () => {
  let day: UsageDay | undefined;
  for (let i = 0; i < DEFAULT_LIMITS.duplicateMax; i++) {
    const d = decide(day, "chat", DEFAULT_LIMITS, T0 + i * 30_000, "same");
    assert.ok(d.ok, `repeat ${i}`);
    if (d.ok) day = d.next;
  }
  const blocked = decide(day, "chat", DEFAULT_LIMITS, T0 + 120_000, "same");
  assert.equal(blocked.ok, false);
  const later = decide(day, "chat", DEFAULT_LIMITS, T0 + DEFAULT_LIMITS.duplicateWindowMs + 120_000, "same");
  assert.equal(later.ok, true);
});

test("recent fingerprints are bounded", () => {
  let day: UsageDay | undefined;
  for (let i = 0; i < 100; i++) {
    const d = decide(day, "chat", { ...DEFAULT_LIMITS, chat: 0 }, T0 + i * 10_000, `p${i}`);
    assert.ok(d.ok);
    if (d.ok) day = d.next;
  }
  assert.ok(day && day.recent.length <= 20);
});

test("days roll over at midnight IST", () => {
  assert.equal(dayKey(Date.UTC(2026, 10, 7, 18, 29)), "2026-11-07"); // 23:59 IST
  assert.equal(dayKey(Date.UTC(2026, 10, 7, 18, 31)), "2026-11-08"); // 00:01 IST
});

test("limits can be configured from the environment", () => {
  const limits = limitsFromEnv({ QUOTA_CHAT_PER_DAY: "10", QUOTA_DOCUMENT_PER_DAY: "0", QUOTA_VOICE_PER_DAY: "abc" });
  assert.equal(limits.chat, 10);
  assert.equal(limits.document, 0);
  assert.equal(limits.voice, DEFAULT_LIMITS.voice);
});

test("prompt normalisation ignores case, spacing and trailing punctuation", () => {
  assert.equal(normalisePrompt("  What is   GOA?? "), normalisePrompt("what is goa"));
  assert.equal(normalisePrompt("गोंय खंय आसा?"), normalisePrompt("गोंय  खंय आसा"));
});
