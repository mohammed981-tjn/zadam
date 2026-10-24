/**
 * يوم القيد حين يُرسَل متأخّراً (البند ١٦٧).
 *
 * A cost typed in the field with no network is sent hours or days later. The ledger would then
 * carry the day it arrived, not the day it was spent. The phone sends the day it was written; the
 * server accepts it only when it is a real date no later than tomorrow (time zones) and no more
 * than two weeks old — the outbox itself drops anything past seven days. Anything else is ignored
 * and the entry gets today, as it always did.
 */
export const MAX_BACKDATE_DAYS = 14;

const DAY = 86_400_000;

export function ledgerEntryDate(raw: string, today: string): string | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !t) return null;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
  const d = new Date(at);
  // Date.UTC rolls 2026-02-31 over to March; a real date round-trips.
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  if (at > now + DAY) return null;
  if (at < now - MAX_BACKDATE_DAYS * DAY) return null;
  return raw;
}
