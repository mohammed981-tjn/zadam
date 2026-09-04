import { createHash, timingSafeEqual } from "node:crypto";

/**
 * مقارنةُ سرِّ المهامّ المجدولة — بزمنٍ ثابت.
 *
 * WHY NOT `!==`
 *
 * Three routes are closed by the same shared secret — /api/health,
 * /api/diagnostics and /api/support/auto-reply — and all three compared the
 * header with `!==`. JavaScript string comparison returns as soon as two bytes
 * differ, so the time it takes to answer depends on how many leading bytes of
 * the guess were right. That is a side channel: a caller who can measure it can
 * recover the secret one byte at a time instead of guessing the whole thing.
 *
 * Over the public internet the jitter usually swamps the signal, so this is
 * hardening rather than a hole being closed. But the fix costs three lines and
 * the alternative is arguing about how much jitter is enough — and the thing
 * behind these doors is a service-role database client and a paid model.
 *
 * WHY IT HASHES FIRST
 *
 * `timingSafeEqual` throws unless both buffers are the same length, so the
 * obvious version has to compare lengths first — and that comparison leaks the
 * secret's length. Hashing both sides to a fixed 32 bytes removes the question:
 * every comparison is the same size and takes the same time, whatever arrived.
 */
export function bearerMatches(header: string | null, secret: string): boolean {
  /*
   * An empty secret is never a key.
   *
   * Without this line `bearerMatches("Bearer ", "")` is true, because the
   * expected value is the literal "Bearer " and the caller sent exactly that.
   * Every route today checks `if (!secret)` before getting here, so it is not
   * reachable — but that is three separate callers all having to remember, and
   * the failure mode if one forgets is that the door opens to a string anyone
   * can type. Refusing it here costs nothing and does not depend on memory.
   */
  if (!secret) return false;

  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();

  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}
