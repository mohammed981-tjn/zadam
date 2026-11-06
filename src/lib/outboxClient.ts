import {
  CLIENT_KEY_FIELD,
  enqueue,
  isNetworkError,
  toFormData,
  load,
  localDay,
  newClientKey,
  newItemId,
  pendingFor,
  remove,
  snapshotFields,
  withClientKey,
  type EnqueueResult,
  type OutboxItem,
  type StorageLike,
} from "@/lib/outbox";

/**
 * The browser side of the outbox (backlog 167): which account is signed in, the phone's storage,
 * and a signal when the box changes. The decisions are all in outbox.ts, where they are tested.
 */

const CHANGED = "sudagri-outbox-changed";

let owner: string | null = null;

/** Set by OutboxProvider from the server-rendered session. Offline, nothing else can say who it is. */
export function setOutboxOwner(id: string | null) {
  owner = id;
  announce();
}

export const getOutboxOwner = () => owner;

function store(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

export function subscribeOutbox(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  window.addEventListener("online", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener("online", callback);
  };
}

export function listPending(key?: string): OutboxItem[] {
  const s = store();
  return s ? pendingFor(load(s, Date.now()), owner, key) : [];
}

export type KeepResult = EnqueueResult | "no-owner" | "unfit";

/**
 * Gives a form its idempotency key (`client_key`) before it is first sent, unless it has one. The same key then goes
 * with every attempt — the first, and the outbox's later ones — so an entry whose answer was lost is not saved twice.
 */
export function stampClientKey(formData: FormData): FormData {
  if (!formData.get(CLIENT_KEY_FIELD)) formData.set(CLIENT_KEY_FIELD, newClientKey());
  return formData;
}

/**
 * Keeps a form that could not be sent. `stamp` names a hidden field to fill with the phone's day
 * (the ledger's `entry_date`), so a late send still carries the day it was written. `clientKey` gives the kept form
 * its idempotency key when it has none yet (one typed with no network at all).
 */
export function keepOffline(args: {
  key: string;
  path: string;
  label: string;
  formData: FormData;
  stamp?: string;
  clientKey?: boolean;
}): KeepResult {
  const s = store();
  if (!s) return "unavailable";
  if (!owner) return "no-owner";
  const snapshot = snapshotFields(args.formData.entries());
  if (!snapshot) return "unfit";
  const fields = args.clientKey ? withClientKey(snapshot) : snapshot;
  const now = Date.now();
  if (args.stamp && !fields.some(([name]) => name === args.stamp)) fields.push([args.stamp, localDay(now)]);
  const result = enqueue(s, { id: newItemId(now), key: args.key, path: args.path, label: args.label, userId: owner, createdAt: now, fields }, now);
  announce();
  return result;
}

/** Takes this form's items out of the box to send them; `putBack` returns what could not go. */
export function takePending(key: string): OutboxItem[] {
  const s = store();
  if (!s) return [];
  const items = listPending(key);
  const now = Date.now();
  for (const i of items) remove(s, i.id, now);
  if (items.length) announce();
  return items;
}

export function putBack(items: OutboxItem[]) {
  const s = store();
  if (!s) return;
  for (const i of items) enqueue(s, i, Date.now());
  if (items.length) announce();
}

export function dropItem(id: string) {
  const s = store();
  if (!s) return;
  remove(s, id, Date.now());
  announce();
}

/** A redirect or not-found travelling as an error: the server answered. */
const isAnswer = (e: unknown) => typeof (e as { digest?: unknown } | null)?.digest === "string";

const replaying = new Set<string>();

/**
 * Sends what this form kept, now that there may be a network. Each item leaves the box before it
 * is sent, so a page that navigates away mid-send (a redirect) cannot send it twice; one that never
 * reached the server goes back in the box, and the rest wait with it. Returns how many were sent.
 */
export async function replayPending(
  key: string,
  send: (formData: FormData) => Promise<unknown>,
  onSent?: (result: unknown) => void,
): Promise<number> {
  if (replaying.has(key) || offlineNow()) return 0;
  replaying.add(key);
  let sent = 0;
  try {
    const items = takePending(key);
    for (let n = 0; n < items.length; n++) {
      try {
        const result = await send(toFormData(items[n]));
        sent++;
        onSent?.(result);
      } catch (e) {
        if (isNetworkError(e)) {
          putBack(items.slice(n));
          break;
        }
        // Answered, with a redirect or with an error of the server's own: not sent again.
        if (isAnswer(e)) sent++;
        else console.error("outbox: the server refused a kept form", e);
      }
    }
  } finally {
    replaying.delete(key);
  }
  return sent;
}

export const offlineNow = () => typeof navigator !== "undefined" && navigator.onLine === false;

export { isNetworkError };

/** What to tell the person after a form could not be sent. */
export function keptMessage(result: KeepResult, t: (ar: string, en: string) => string): { ok: boolean; message: string } {
  switch (result) {
    case "kept":
    case "duplicate":
      return {
        ok: true,
        message: t(
          "لا يوجد اتصال الآن. حفظنا ما كتبتَه على هاتفك، وسيُرسَل حين تعود الشبكة (افتح هذه الصفحة وأنت متّصل).",
          "There is no connection right now. We kept what you wrote on your phone and it will be sent when the network is back (open this page while online).",
        ),
      };
    case "full":
      return {
        ok: false,
        message: t(
          "لا يوجد اتصال، وعندك عشرون شيئاً محفوظاً لم يُرسل، فلا نستطيع حفظ المزيد. أرسلها أولاً حين تعود الشبكة.",
          "There is no connection, and you already have twenty unsent items kept, so no more can be kept. Send them first once the network is back.",
        ),
      };
    case "no-owner":
      return { ok: false, message: t("لا يوجد اتصال، وتعذّر حفظ ما كتبتَه لأنّ الجلسة غير معروفة. أعد المحاولة حين تتّصل.", "There is no connection, and what you wrote could not be kept because the session is unknown. Try again when you are online.") };
    case "unfit":
      return { ok: false, message: t("لا يوجد اتصال، ولا يمكن حفظ هذا النموذج لأنّ فيه ملفّاً. أعد المحاولة حين تتّصل.", "There is no connection, and this form cannot be kept because it has a file. Try again when you are online.") };
    default:
      return { ok: false, message: t("لا يوجد اتصال، وتعذّر حفظ ما كتبتَه على هذا الهاتف. أعد المحاولة حين تتّصل.", "There is no connection, and what you wrote could not be kept on this phone. Try again when you are online.") };
  }
}
