import { getOutboxOwner, offlineNow } from "@/lib/outboxClient";
import {
  keepPhoto,
  loadPhotos,
  newPhotoId,
  photosFor,
  removePhoto,
  replayPhotos,
  type KeepPhotoResult,
  type PhotoItem,
  type PhotoStore,
  type RecordPhoto,
  type ReplayResult,
  type UploadPhoto,
} from "@/lib/photoOutbox";
import type { PhotoMetadata } from "@/lib/exif";

/**
 * The browser side of the photo box (backlog 185): IndexedDB, the signed-in account (the same one the text outbox
 * knows), and a signal when the box changes. The decisions are in photoOutbox.ts, where they are tested.
 */

const DB = "sudagri-photos";
const STORE = "items";
const CHANGED = "sudagri-photos-changed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export const idbStore: PhotoStore = {
  all: () => run<PhotoItem[]>("readonly", (s) => s.getAll() as IDBRequest<PhotoItem[]>),
  put: (item) => run("readwrite", (s) => s.put(item)).then(() => undefined),
  delete: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
};

/** What the page shows: the photos without their bytes, so a snapshot is cheap to compare. */
export type PhotoSummary = Omit<PhotoItem, "file">;

let cache: PhotoSummary[] = [];
let cacheJson = "[]";

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

/** Reads the box again; the page hears of it only when something changed. */
export async function refreshPhotos(): Promise<void> {
  const items: PhotoSummary[] = (await loadPhotos(idbStore)).map((i) => {
    const rest: Partial<PhotoItem> = { ...i };
    delete rest.file;
    return rest as PhotoSummary;
  });
  const json = JSON.stringify(items);
  if (json !== cacheJson) {
    cache = items;
    cacheJson = json;
    announce();
  }
}

export function subscribePhotos(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("online", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("online", callback);
  };
}

/** The signed-in account's kept photos, optionally of one form, as JSON (for useSyncExternalStore). */
export function photosSnapshot(key?: string): string {
  const owner = getOutboxOwner();
  if (!owner) return "[]";
  return JSON.stringify(photosFor(cache as PhotoItem[], owner, key));
}

export type KeepResult = KeepPhotoResult | "no-owner";

export async function keepPhotoOffline(args: {
  /** The id already given to a file that went up before the record failed: its path stays the same. */
  id?: string;
  key: string;
  path: string;
  label: string;
  folder: string;
  kind: string;
  caption: string;
  metadata: PhotoMetadata;
  file: Blob;
}): Promise<KeepResult> {
  const owner = getOutboxOwner();
  if (!owner) return "no-owner";
  const now = Date.now();
  const result = await keepPhoto(
    idbStore,
    {
      id: args.id ?? newPhotoId(now),
      key: args.key,
      path: args.path,
      label: args.label,
      userId: owner,
      createdAt: now,
      folder: args.folder,
      kind: args.kind,
      caption: args.caption,
      metadata: args.metadata,
      type: args.file.type,
      size: args.file.size,
      file: args.file,
      status: "waiting",
    },
    now,
  ).catch(() => "unavailable" as const);
  await refreshPhotos().catch(() => undefined);
  return result;
}

export async function dropPhoto(id: string): Promise<void> {
  await removePhoto(idbStore, id, getOutboxOwner()).catch(() => undefined);
  await refreshPhotos().catch(() => undefined);
}

const sending = new Set<string>();

/** Sends this form's waiting photos, now that there may be a network. One run per form at a time. */
export async function sendKeptPhotos(key: string, upload: UploadPhoto, record: RecordPhoto): Promise<ReplayResult> {
  if (sending.has(key) || offlineNow()) return { sent: 0, refused: 0, offline: offlineNow() };
  sending.add(key);
  try {
    return await replayPhotos(idbStore, {
      userId: getOutboxOwner(),
      key,
      upload,
      record,
      now: () => Date.now(),
      online: () => !offlineNow(),
    });
  } catch {
    return { sent: 0, refused: 0, offline: false };
  } finally {
    sending.delete(key);
    await refreshPhotos().catch(() => undefined);
  }
}

/** What to tell the person after a photo could not be sent at once. */
export function keptPhotoMessage(result: KeepResult, t: (ar: string, en: string) => string): { ok: boolean; message: string } {
  switch (result) {
    case "kept":
    case "duplicate":
      return {
        ok: true,
        message: t(
          "لا يوجد اتصال الآن. حفظنا الملف على هاتفك، وسيُرفع حين تعود الشبكة وأنت على هذه الصفحة.",
          "There is no connection right now. We kept the file on your phone; it will be uploaded when the network is back while you are on this page.",
        ),
      };
    case "full":
      return {
        ok: false,
        message: t(
          "لا يوجد اتصال، والمساحة المحفوظة على هاتفك امتلأت (٢٠ ملفّاً أو ٤٠ ميجابايت). ارفع ما ينتظر أو احذف بعضه أولاً.",
          "There is no connection, and the space kept on your phone is full (20 files or 40 MB). Upload what is waiting or remove some first.",
        ),
      };
    case "too-big":
      return { ok: false, message: t("لا يوجد اتصال، والملف أكبر من ١٠ ميجابايت فلا يُحفظ. صوّره بدقّةٍ أقلّ.", "There is no connection, and the file is over 10 MB so it cannot be kept. Take it at a lower resolution.") };
    case "no-owner":
      return { ok: false, message: t("لا يوجد اتصال، وتعذّر حفظ الملف لأنّ الجلسة غير معروفة. أعد المحاولة حين تتّصل.", "There is no connection, and the file could not be kept because the session is unknown. Try again when you are online.") };
    default:
      return { ok: false, message: t("لا يوجد اتصال، وتعذّر حفظ الملف على هذا الهاتف. أعد المحاولة حين تتّصل.", "There is no connection, and the file could not be kept on this phone. Try again when you are online.") };
  }
}
