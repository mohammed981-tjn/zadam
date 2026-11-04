/**
 * صورٌ تنتظر الشبكة (البند ١٨٥): دليل المرحلة ومستند الأرض لا يضيعان إن انقطعت الشبكة.
 *
 * The outbox of backlog 167 keeps typed fields in localStorage and refuses a form with a file in it: a photo is
 * megabytes, and localStorage holds a few in all. A photo chosen with no network is kept here instead — in IndexedDB,
 * which stores the file itself — and uploaded when the network is back, through the same upload and the same server
 * action as one sent at once. So every rule the database keeps on evidence still holds on the way in: the file goes in
 * the writer's own folder, its capture metadata (read from the original before it was shrunk) goes with it, and a
 * stage that was approved meanwhile refuses it.
 *
 * WHAT IS KEPT, AND FOR WHOM
 *
 *   - Every photo carries the id of the person who chose it. Another account signed in on the same phone is never
 *     shown it and never sends it.
 *   - Twenty photos and 40 MB at most, ten per photo (the bucket's own limit). Nothing is dropped to make room: a full
 *     box says so, and the person sends or removes what is waiting.
 *   - Nothing expires on its own. A photo is evidence; it leaves the box when it is recorded, or when its owner
 *     removes it. One the server refused stays, with the server's words, until its owner has seen them and removed it.
 *
 * NEVER TWICE
 *
 *   - The file's path is fixed when it is kept (`<user>/<folder>/<item id>.<ext>`), so a second attempt after one cut
 *     off half-way finds the file already there and goes on to record it, instead of uploading a copy.
 *   - An item is marked as being sent before anything leaves the phone; another tab, or a second tap, leaves it alone.
 *   - The record actions answer «already recorded» for a path they already hold, so a reply lost on the way back does
 *     not make a second row.
 *
 * Everything here is pure over a `PhotoStore`, so it is tested without a browser (scripts/verify-offline-photos.ts).
 * The IndexedDB glue is in photoOutboxClient.ts.
 */

import type { PhotoMetadata } from "./exif";
import { isNetworkError } from "./outbox";

export interface PhotoItem {
  id: string;
  /** The form it belongs to: `stage:<stageId>`, `land:<landId>`. */
  key: string;
  /** The page whose form sends it. */
  path: string;
  /** What it is, for the banner: «دليل مرحلة». */
  label: string;
  /** Who chose it. Only this account may send it. */
  userId: string;
  createdAt: number;
  /** The storage sub-folder under the user's own id: "stages", "lands". */
  folder: string;
  /** The evidence or document kind chosen with it. */
  kind: string;
  caption: string;
  /** Read from the original file before compression, as when sent at once. */
  metadata: PhotoMetadata;
  /** The file's content type, as it will be uploaded. */
  type: string;
  size: number;
  file: Blob;
  status: "waiting" | "refused";
  /** The server's words, for a refused photo. */
  message?: string;
  /** Set while a send is under way; an old one is a send that never finished. */
  sendingSince?: number;
}

/** The phone's store, as IndexedDB offers it: every item, one put, one delete. */
export interface PhotoStore {
  all(): Promise<PhotoItem[]>;
  put(item: PhotoItem): Promise<void>;
  delete(id: string): Promise<void>;
}

export const MAX_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
/** Two identical photos kept this close together are one double tap. */
export const DUPLICATE_WINDOW_MS = 60_000;
/** A send marked this long ago never finished (the tab closed): the photo may be sent again. */
export const STALE_SEND_MS = 120_000;

export const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** The path the photo will have in storage, fixed when it is kept. The first folder is the writer's id. */
export const storagePathOf = (item: Pick<PhotoItem, "userId" | "folder" | "id" | "type">) =>
  `${item.userId}/${item.folder}/${item.id}.${EXTENSION[item.type] ?? "jpg"}`;

export type KeepPhotoResult = "kept" | "duplicate" | "full" | "too-big" | "unfit" | "unavailable";

const isItem = (x: unknown): x is PhotoItem => {
  const i = x as Partial<PhotoItem> | null;
  return (
    !!i &&
    typeof i.id === "string" && /^[a-z0-9-]{4,60}$/.test(i.id) &&
    typeof i.key === "string" &&
    typeof i.path === "string" && i.path.startsWith("/") && !i.path.startsWith("//") &&
    typeof i.userId === "string" && i.userId.length > 0 &&
    typeof i.folder === "string" && /^[a-z-]{2,30}$/.test(i.folder) &&
    typeof i.size === "number" && Number.isFinite(i.size) &&
    typeof i.createdAt === "number" &&
    !!i.file && (i.status === "waiting" || i.status === "refused")
  );
};

/** What is kept, with anything malformed left out. Never throws. */
export async function loadPhotos(store: PhotoStore): Promise<PhotoItem[]> {
  try {
    return (await store.all()).filter(isItem).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** The photos this account may see and send, optionally of one form. Another account's are never listed. */
export function photosFor(items: PhotoItem[], userId: string | null, key?: string): PhotoItem[] {
  if (!userId) return [];
  return items.filter((i) => i.userId === userId && (key === undefined || i.key === key));
}

export async function keepPhoto(store: PhotoStore, item: PhotoItem, now: number): Promise<KeepPhotoResult> {
  if (!EXTENSION[item.type] || !isItem(item)) return "unfit";
  if (item.size > MAX_PHOTO_BYTES) return "too-big";
  let items: PhotoItem[];
  try {
    items = await store.all();
  } catch {
    return "unavailable";
  }
  items = items.filter(isItem);
  if (
    items.some(
      (i) =>
        i.userId === item.userId && i.key === item.key && i.size === item.size && i.caption === item.caption &&
        now - i.createdAt < DUPLICATE_WINDOW_MS,
    )
  ) {
    return "duplicate";
  }
  // The cap is the phone's, not one account's: every photo on it takes room.
  if (items.length >= MAX_PHOTOS) return "full";
  if (items.reduce((n, i) => n + i.size, 0) + item.size > MAX_TOTAL_BYTES) return "full";
  try {
    await store.put({ ...item, status: "waiting", message: undefined, sendingSince: undefined });
    return "kept";
  } catch {
    return "unavailable";
  }
}

export async function removePhoto(store: PhotoStore, id: string, userId: string | null): Promise<void> {
  if (!userId) return;
  const item = (await loadPhotos(store)).find((i) => i.id === id);
  // Only its owner removes it: a shared phone's other account cannot clear someone else's evidence.
  if (item && item.userId === userId) await store.delete(id);
}

/** Uploads the file to the path given; resolves with the storage's own error, if any. */
export type UploadPhoto = (path: string, file: Blob, type: string) => Promise<{ error: { message: string } | null }>;
/** Records the uploaded file through the form's own server action. */
export type RecordPhoto = (item: PhotoItem, storagePath: string) => Promise<{ ok: boolean; message?: string } | void>;

/** The storage's answer when the fixed path already holds the file: an earlier attempt got that far. */
const ALREADY_THERE = /already exists|duplicate|resource already/i;

export interface ReplayResult {
  sent: number;
  refused: number;
  /** Stopped on a network that went away again: the rest wait. */
  offline: boolean;
}

/**
 * Sends this form's waiting photos, oldest first. A network failure stops the run and leaves the photo (and every one
 * after it) waiting; an answer that refuses it keeps it, marked refused with the answer, for its owner to see. Only a
 * recorded photo leaves the box.
 */
export async function replayPhotos(
  store: PhotoStore,
  args: { userId: string | null; key: string; upload: UploadPhoto; record: RecordPhoto; now: () => number; online: () => boolean },
): Promise<ReplayResult> {
  const out: ReplayResult = { sent: 0, refused: 0, offline: false };
  if (!args.userId || !args.online()) return { ...out, offline: !args.online() };
  const items = photosFor(await loadPhotos(store), args.userId, args.key).filter(
    (i) => i.status === "waiting" && !(i.sendingSince && args.now() - i.sendingSince < STALE_SEND_MS),
  );

  for (const item of items) {
    const path = storagePathOf(item);
    const refuse = async (message: string) => {
      await store.put({ ...item, status: "refused", message, sendingSince: undefined });
      out.refused++;
    };
    // Marked before anything leaves the phone: a second run (another tab, a second tap) leaves it alone.
    await store.put({ ...item, sendingSince: args.now() });
    const release = () => store.put({ ...item, sendingSince: undefined });

    let uploaded: { error: { message: string } | null };
    try {
      uploaded = await args.upload(path, item.file, item.type);
    } catch (e) {
      if (isNetworkError(e)) {
        await release();
        out.offline = true;
        break;
      }
      await refuse(e instanceof Error ? e.message : String(e));
      continue;
    }
    if (uploaded.error && !ALREADY_THERE.test(uploaded.error.message)) {
      if (isNetworkError(uploaded.error)) {
        await release();
        out.offline = true;
        break;
      }
      await refuse(uploaded.error.message);
      continue;
    }

    let recorded: { ok: boolean; message?: string } | void;
    try {
      recorded = await args.record(item, path);
    } catch (e) {
      if (isNetworkError(e)) {
        // The file is there; the next run finds it and records it.
        await release();
        out.offline = true;
        break;
      }
      await refuse(e instanceof Error ? e.message : String(e));
      continue;
    }
    if (recorded && !recorded.ok) {
      await refuse(recorded.message ?? "");
      continue;
    }
    await store.delete(item.id);
    out.sent++;
  }
  return out;
}

export function newPhotoId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 0xffffffff).toString(36)}`;
}
