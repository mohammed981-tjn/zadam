/**
 * A short-lived cache for model answers.
 *
 * Visitors ask the same handful of questions. Paying the model again for a
 * question it answered four minutes ago spends quota that a real visitor will
 * need later, and makes the second asker wait for a round trip that produces
 * the same text.
 *
 * Honest about its limits: this lives in the process, so on a serverless host
 * each warm instance keeps its own copy and a cold start begins empty. That
 * makes it a quota cushion, not a guarantee — worth having precisely because it
 * costs nothing and cannot fail in a way that hurts the visitor.
 */

import { normalizeArabic } from "@/lib/retrieval";

interface Entry {
  answer: string;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

const cache = new Map<string, Entry>();

/**
 * Questions differing only in spacing, punctuation, alef form or a trailing
 * question mark are the same question.
 */
function key(question: string): string {
  return normalizeArabic(question)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function getCachedAnswer(question: string, now = Date.now()): string | null {
  const k = key(question);
  const hit = cache.get(k);
  if (!hit) return null;

  if (hit.expiresAt <= now) {
    cache.delete(k);
    return null;
  }

  // Re-insert so the map's insertion order tracks recency of use, which is what
  // the eviction below relies on.
  cache.delete(k);
  cache.set(k, hit);
  return hit.answer;
}

export function setCachedAnswer(
  question: string,
  answer: string,
  now = Date.now(),
): void {
  const k = key(question);
  if (k.length === 0) return;

  cache.delete(k);
  cache.set(k, { answer, expiresAt: now + TTL_MS });

  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Testing seam. */
export function clearAnswerCache(): void {
  cache.clear();
}
