/**
 * صندوقُ الصادر على الهاتف (البند ١٦٧): ما يكتبه المزارع لا يضيع إن انقطعت الشبكة.
 *
 * A form submitted with no network (or a network that dies half-way) used to fail and wipe what
 * had been typed. Now the fields are kept on the phone and sent when the network is back — by the
 * same server action, so every check the server does still runs on the way in.
 *
 * WHAT IS KEPT, AND FOR WHOM
 *
 *   - Only text fields. A file is never kept (a photo needs its own upload), nor a password.
 *   - Every item carries the id of the person who wrote it. Another account that signs in on the
 *     same phone is never offered it and never sends it: a household phone is shared.
 *   - Seven days, then it is dropped; twenty items at most. A form older than that no longer
 *     says what its writer meant.
 *   - Private pages stay out of the service worker's cache (public/sw.js says why). This is not a
 *     way round that: it keeps what the person typed, not what the server answered.
 *
 * Everything here is pure over a `StorageLike`, so it is tested without a browser
 * (scripts/verify-outbox.ts). The browser glue is in outboxClient.ts.
 */

export interface OutboxItem {
  id: string;
  /** The form it belongs to: `ledger:<seasonId>`, `land-test:<landId>`, … */
  key: string;
  /** The page the form is on, to take the person back to it. */
  path: string;
  /** What it is, for the banner: «قيد مصروف». */
  label: string;
  /** Who wrote it. Only this account may send it. */
  userId: string;
  createdAt: number;
  fields: [string, string][];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const OUTBOX_STORAGE_KEY = "sudagri-outbox-v1";
export const MAX_ITEMS = 20;
export const MAX_AGE_MS = 7 * 86_400_000;
export const MAX_VALUE_CHARS = 2_000;
/** Two identical submissions this close together are one double tap. */
export const DUPLICATE_WINDOW_MS = 60_000;

/** A fetch that never reached the server — as browsers word it. A server's own error is not one. */
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|internet connection appears to be offline|fetch failed|network connection was lost/i;

export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  // Next's redirect and not-found signals travel as errors; they are answers, not outages.
  if ("digest" in e && typeof (e as { digest?: unknown }).digest === "string") return false;
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && NETWORK_MESSAGE.test(message);
}

const SECRET_NAME = /pass(word)?|secret|token|otp|pin\b/i;

/**
 * The text fields of a form, ready to keep. Null when the form cannot be kept honestly: a file in
 * it, or a value too long to be a typed answer.
 */
export function snapshotFields(entries: Iterable<[string, unknown]>): [string, string][] | null {
  const out: [string, string][] = [];
  for (const [name, value] of entries) {
    if (name.startsWith("$ACTION")) continue;
    if (typeof value !== "string") {
      // An empty file input still arrives as a (nameless, empty) File: that is no file at all.
      const size = (value as { size?: unknown } | null)?.size;
      if (size === 0) continue;
      return null;
    }
    if (SECRET_NAME.test(name)) continue;
    if (value.length > MAX_VALUE_CHARS) return null;
    out.push([name, value]);
  }
  return out;
}

export function toFormData(item: Pick<OutboxItem, "fields">): FormData {
  const fd = new FormData();
  for (const [name, value] of item.fields) fd.append(name, value);
  return fd;
}

const isItem = (x: unknown): x is OutboxItem => {
  const i = x as Partial<OutboxItem> | null;
  return (
    !!i &&
    typeof i.id === "string" &&
    typeof i.key === "string" &&
    typeof i.path === "string" && i.path.startsWith("/") && !i.path.startsWith("//") &&
    typeof i.label === "string" &&
    typeof i.userId === "string" &&
    typeof i.createdAt === "number" && Number.isFinite(i.createdAt) &&
    Array.isArray(i.fields) &&
    i.fields.every((f) => Array.isArray(f) && f.length === 2 && typeof f[0] === "string" && typeof f[1] === "string")
  );
};

/** What is kept, with the malformed and the expired left out. Never throws. */
export function load(storage: StorageLike, now: number): OutboxItem[] {
  try {
    const raw = storage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isItem).filter((i) => now - i.createdAt < MAX_AGE_MS && i.createdAt <= now + 60_000);
  } catch {
    return [];
  }
}

function save(storage: StorageLike, items: OutboxItem[]): boolean {
  try {
    if (items.length === 0) storage.removeItem(OUTBOX_STORAGE_KEY);
    else storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export type EnqueueResult = "kept" | "duplicate" | "full" | "unavailable";

const sameFields = (a: OutboxItem["fields"], b: OutboxItem["fields"]) => JSON.stringify(a) === JSON.stringify(b);

export function enqueue(storage: StorageLike, item: OutboxItem, now: number): EnqueueResult {
  const items = load(storage, now);
  if (items.some((i) => i.userId === item.userId && i.key === item.key && now - i.createdAt < DUPLICATE_WINDOW_MS && sameFields(i.fields, item.fields))) {
    return "duplicate";
  }
  if (items.length >= MAX_ITEMS) return "full";
  return save(storage, [...items, item]) ? "kept" : "unavailable";
}

export function remove(storage: StorageLike, id: string, now: number): void {
  save(storage, load(storage, now).filter((i) => i.id !== id));
}

/** The items this account may send, optionally of one form. Another account's are never listed. */
export function pendingFor(items: OutboxItem[], userId: string | null, key?: string): OutboxItem[] {
  if (!userId) return [];
  return items.filter((i) => i.userId === userId && (key === undefined || i.key === key));
}

export function newItemId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 0xffffff).toString(36)}`;
}

/** The `YYYY-MM-DD` the person wrote the form on, in the phone's own day. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
