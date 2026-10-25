/**
 * صورٌ تنتظر الشبكة (البند ١٨٥): ما يُحفظ على الهاتف ولمن وبأيّ سقف، وكيف يُرفع حين تعود الشبكة — بلا تكرار، وبلا
 * رفضٍ يضيع في صمت.
 *
 *   npx tsx scripts/verify-offline-photos.ts
 */
import {
  DUPLICATE_WINDOW_MS,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_TOTAL_BYTES,
  STALE_SEND_MS,
  keepPhoto,
  loadPhotos,
  photosFor,
  removePhoto,
  replayPhotos,
  storagePathOf,
  type PhotoItem,
  type PhotoStore,
  type RecordPhoto,
  type UploadPhoto,
} from "../src/lib/photoOutbox";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

/** IndexedDB as the box sees it: every item, put, delete — a structured copy each way, as IndexedDB gives. */
const memory = (opts: { broken?: boolean; unreadable?: boolean } = {}): PhotoStore & { data: Map<string, PhotoItem> } => {
  const data = new Map<string, PhotoItem>();
  return {
    data,
    all: async () => {
      if (opts.broken || opts.unreadable) throw new Error("QuotaExceededError");
      return [...data.values()].map((i) => ({ ...i }));
    },
    put: async (i) => {
      if (opts.broken) throw new Error("QuotaExceededError");
      data.set(i.id, { ...i });
    },
    delete: async (id) => void data.delete(id),
  };
};

/** The evidence bucket: a path holds one file, and a second upload to it is refused as storage refuses it. */
const bucket = () => {
  const files = new Map<string, Blob>();
  let uploads = 0;
  let down = false;
  const upload: UploadPhoto = async (path, file) => {
    if (down) throw new TypeError("Failed to fetch");
    uploads++;
    if (files.has(path)) return { error: { message: "The resource already exists" } };
    files.set(path, file);
    return { error: null };
  };
  return { files, upload, uploads: () => uploads, setDown: (d: boolean) => void (down = d) };
};

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const MB = 1024 * 1024;
const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });
const photo = (over: Partial<PhotoItem> = {}): PhotoItem => ({
  id: "p0001",
  key: "stage:s1",
  path: "/seasons/x",
  label: "دليل مرحلة",
  userId: "u1",
  createdAt: NOW,
  folder: "stages",
  kind: "photo",
  caption: "الحرث",
  metadata: { capturedAt: "2026-10-24T07:12:00.000Z", latitude: 15.6, longitude: 32.5 },
  type: "image/jpeg",
  size: 2 * MB,
  file: blob(16),
  status: "waiting",
  ...over,
});

async function main() {
  console.log("Keeping a photo");
  {
    const s = memory();
    eq(await keepPhoto(s, photo(), NOW), "kept", "a photo is kept");
    eq((await loadPhotos(s)).length, 1, "and is in the box");
    eq((await loadPhotos(s))[0].metadata.capturedAt, "2026-10-24T07:12:00.000Z", "with the day it was taken, read from the original");
    eq(await keepPhoto(s, photo({ id: "p0002", createdAt: NOW + 5_000 }), NOW + 5_000), "duplicate", "the same photo tapped twice is kept once");
    eq(await keepPhoto(s, photo({ id: "p0003", createdAt: NOW + DUPLICATE_WINDOW_MS }), NOW + DUPLICATE_WINDOW_MS), "kept", "the same photo a minute later is another photo");
    eq(await keepPhoto(s, photo({ id: "p0004", caption: "غيرها" }), NOW), "kept", "another photo is kept");
    eq(await keepPhoto(s, photo({ id: "p0005", type: "text/html" }), NOW), "unfit", "a file of another type is not");
    eq(await keepPhoto(s, photo({ id: "p0006", size: MAX_PHOTO_BYTES + 1, caption: "كبير" }), NOW), "too-big", "a file over the bucket's 10 MB is not");
    eq(await keepPhoto(memory({ broken: true }), photo(), NOW), "unavailable", "a phone whose storage fails says so");
    const unreadable = memory({ unreadable: true });
    eq(await keepPhoto(unreadable, photo(), NOW), "unavailable", "a box that cannot be read is not written blind (its cap unknown)");
    eq(unreadable.data.size, 0, "and nothing is put in it");
    eq(storagePathOf(photo()), "u1/stages/p0001.jpg", "its path is fixed now, under the writer's own folder");
  }

  console.log("\nThe cap: twenty photos and 40 MB on the phone, and nothing dropped to make room");
  {
    const s = memory();
    for (let n = 0; n < MAX_PHOTOS; n++) await keepPhoto(s, photo({ id: `c${String(n).padStart(4, "0")}`, caption: `c${n}`, size: 1 * MB }), NOW);
    eq((await loadPhotos(s)).length, MAX_PHOTOS, "twenty kept");
    eq(await keepPhoto(s, photo({ id: "c9999", caption: "one more", size: 1 * MB }), NOW), "full", "the twenty-first is refused");
    eq((await loadPhotos(s)).length, MAX_PHOTOS, "and none of the twenty is dropped for it");

    const big = memory();
    for (let n = 0; n < 4; n++) await keepPhoto(big, photo({ id: `b${String(n).padStart(4, "0")}`, caption: `b${n}`, size: 9 * MB }), NOW);
    eq(await keepPhoto(big, photo({ id: "b9999", caption: "over", size: 5 * MB }), NOW), "full", `36 MB kept: 5 more would pass ${MAX_TOTAL_BYTES / MB} MB`);
    eq(await keepPhoto(big, photo({ id: "b8888", caption: "fits", size: 4 * MB }), NOW), "kept", "4 more fits exactly");
    eq(
      await keepPhoto(big, photo({ id: "b7777", userId: "u2", caption: "theirs", size: 1 * MB }), NOW),
      "full",
      "the cap is the phone's: another account's photo takes room too",
    );
  }

  console.log("\nWhose photos");
  {
    const s = memory();
    await keepPhoto(s, photo(), NOW);
    await keepPhoto(s, photo({ id: "o0001", userId: "u2", caption: "theirs" }), NOW);
    const all = await loadPhotos(s);
    eq(photosFor(all, "u1").map((i) => i.id), ["p0001"], "an account sees its own photo only");
    eq(photosFor(all, null), [], "nobody signed in sees none");
    eq(photosFor(all, "u1", "land:l1"), [], "and one form's list holds that form's photos only");
    await removePhoto(s, "o0001", "u1");
    eq((await loadPhotos(s)).length, 2, "nobody removes another account's photo");
    await removePhoto(s, "p0001", "u1");
    eq((await loadPhotos(s)).map((i) => i.id), ["o0001"], "its owner does");
  }

  const run = (s: PhotoStore, b: ReturnType<typeof bucket>, record: RecordPhoto, opts: { online?: boolean; now?: number; userId?: string } = {}) =>
    replayPhotos(s, {
      userId: opts.userId ?? "u1",
      key: "stage:s1",
      upload: b.upload,
      record,
      now: () => opts.now ?? NOW + 1000,
      online: () => opts.online ?? true,
    });

  console.log("\nWhen the network comes back");
  {
    const s = memory();
    const b = bucket();
    const recorded: { path: string; caption: string; capturedAt: string | null; kind: string }[] = [];
    const record: RecordPhoto = async (item, path) => {
      recorded.push({ path, caption: item.caption, capturedAt: item.metadata.capturedAt, kind: item.kind });
      return { ok: true };
    };
    await keepPhoto(s, photo(), NOW);
    await keepPhoto(s, photo({ id: "p0002", caption: "البذر", createdAt: NOW + 1 }), NOW + 1);
    await keepPhoto(s, photo({ id: "p0003", key: "land:l1", folder: "lands", caption: "عقد" }), NOW);

    eq(await run(s, b, record, { online: false }), { sent: 0, refused: 0, offline: true }, "still offline: nothing is tried");
    eq(b.uploads(), 0, "and nothing uploaded");
    eq(await run(s, b, record, { userId: "u2" }), { sent: 0, refused: 0, offline: false }, "another account signed in sends none of them");

    eq(await run(s, b, record), { sent: 2, refused: 0, offline: false }, "back online: both of this form's photos go");
    eq(recorded.map((r) => r.path), ["u1/stages/p0001.jpg", "u1/stages/p0002.jpg"], "oldest first, each at its own path, through the form's action");
    eq(recorded[0].capturedAt, "2026-10-24T07:12:00.000Z", "with the day it was taken");
    eq(recorded[0].kind, "photo", "and the kind chosen with it");
    eq((await loadPhotos(s)).map((i) => i.id), ["p0003"], "recorded photos leave the box; the other form's stays");
    eq(await run(s, b, record), { sent: 0, refused: 0, offline: false }, "a second run sends nothing more");
    eq(b.files.size, 2, "two files in storage, not four");
  }

  console.log("\nA network that drops again half-way");
  {
    const s = memory();
    const b = bucket();
    let calls = 0;
    let cut = true;
    const record: RecordPhoto = async () => {
      calls++;
      if (cut) throw new TypeError("Failed to fetch");
      return { ok: true };
    };
    await keepPhoto(s, photo(), NOW);
    await keepPhoto(s, photo({ id: "p0002", caption: "البذر", createdAt: NOW + 1 }), NOW + 1);

    // The file went up; the record never reached the server.
    eq(await run(s, b, record), { sent: 0, refused: 0, offline: true }, "the run stops on the network");
    eq(calls, 1, "and does not go on to the next photo");
    const left = await loadPhotos(s);
    eq(left.map((i) => [i.id, i.status, i.sendingSince ?? null]), [["p0001", "waiting", null], ["p0002", "waiting", null]], "both still wait, neither left marked as sending");

    cut = false;
    eq(await run(s, b, record), { sent: 2, refused: 0, offline: false }, "next time both go");
    eq(b.files.size, 2, "the first file is found where it went, not uploaded a second time");
    eq(calls, 3, "and recorded once more (the action answers «already recorded» for a path it holds)");

    const s2 = memory();
    const b2 = bucket();
    await keepPhoto(s2, photo(), NOW);
    b2.setDown(true);
    eq(await run(s2, b2, async () => ({ ok: true })), { sent: 0, refused: 0, offline: true }, "the upload itself cut off: still waiting");
    eq((await loadPhotos(s2))[0].status, "waiting", "not refused for a network that failed");
  }

  console.log("\nA refusal is shown, never dropped");
  {
    const s = memory();
    const b = bucket();
    const refusal = "لا يُضاف دليلٌ إلى مرحلةٍ اعتُمدت.";
    let calls = 0;
    const record: RecordPhoto = async () => {
      calls++;
      return { ok: false, message: refusal };
    };
    await keepPhoto(s, photo(), NOW);
    await keepPhoto(s, photo({ id: "p0002", caption: "البذر", createdAt: NOW + 1 }), NOW + 1);
    eq(await run(s, b, record), { sent: 0, refused: 2, offline: false }, "the stage was approved meanwhile: both refused");
    const kept = await loadPhotos(s);
    eq(kept.map((i) => [i.status, i.message]), [["refused", refusal], ["refused", refusal]], "kept in the box, with the server's words");
    eq(await run(s, b, record), { sent: 0, refused: 0, offline: false }, "a refused photo is not sent again on its own");
    eq(calls, 2, "the action was asked once for each");

    const s2 = memory();
    await keepPhoto(s2, photo(), NOW);
    const denied: UploadPhoto = async () => ({ error: { message: "new row violates row-level security policy" } });
    eq(
      await replayPhotos(s2, { userId: "u1", key: "stage:s1", upload: denied, record: async () => ({ ok: true }), now: () => NOW, online: () => true }),
      { sent: 0, refused: 1, offline: false },
      "storage refusing the file is a refusal too",
    );
    eq((await loadPhotos(s2))[0].message, "new row violates row-level security policy", "with its words");
  }

  console.log("\nNever twice at once");
  {
    const s = memory();
    const b = bucket();
    let calls = 0;
    const record: RecordPhoto = async () => {
      calls++;
      return { ok: true };
    };
    await keepPhoto(s, photo(), NOW);
    const marked = (await loadPhotos(s))[0];
    await s.put({ ...marked, sendingSince: NOW + 500 });
    eq(await run(s, b, record, { now: NOW + 1000 }), { sent: 0, refused: 0, offline: false }, "a photo another tab is sending is left alone");
    eq(b.uploads(), 0, "and not uploaded twice");
    eq(await run(s, b, record, { now: NOW + 500 + STALE_SEND_MS }), { sent: 1, refused: 0, offline: false }, "a send that never finished (the tab closed) is taken up again");
    eq(calls, 1, "once");
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK");
}

main();
