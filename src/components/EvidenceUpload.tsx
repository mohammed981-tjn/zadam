"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { readJpegMetadata, NO_METADATA, type PhotoMetadata } from "@/lib/exif";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import { getOutboxOwner, isNetworkError, offlineNow } from "@/lib/outboxClient";
import { newPhotoId, storagePathOf } from "@/lib/photoOutbox";
import {
  dropPhoto,
  keepPhotoOffline,
  keptPhotoMessage,
  photosSnapshot,
  refreshPhotos,
  sendKeptPhotos,
  subscribePhotos,
  type PhotoSummary,
} from "@/lib/photoOutboxClient";

/** How often a mounted form looks for a network that came back without a browser event. */
const RETRY_MS = 30_000;

export interface EvidenceKind {
  value: string;
  label: string;
}

/** The bucket's own limit; the server rejects anything above it regardless. */
const MAX_BYTES = 10 * 1024 * 1024;
/** What the browser will attempt to decode and shrink before giving up. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/*
 * The extension comes from the content type, not from the file name.
 *
 * Splitting the name on "." and keeping the last piece looks equivalent until a
 * file arrives with no extension at all: "صورة".split(".").pop() returns the
 * whole Arabic name, which then lands in the storage path — and object names
 * accept only a restricted character set, so the upload fails with an error
 * that says nothing about the real cause. Deriving the extension from the type
 * the file was already validated against removes the possibility.
 */
const ACCEPTED_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const ACCEPTED = Object.keys(ACCEPTED_EXTENSION);

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

/**
 * Uploads a real file, then records it.
 *
 * The file goes straight from the browser to storage rather than through a
 * server action, so a ten-megabyte photo never has to be base64-encoded into a
 * request body. The object is written under the uploader's own user id, which
 * is what the storage policy checks, and only the resulting path is handed to
 * the action that writes the row.
 */
export default function EvidenceUpload({
  kinds,
  folder,
  onUploaded,
  label,
  offline,
}: {
  kinds: EvidenceKind[];
  /** Sub-folder under the user's own id, e.g. "lands" or "stages". */
  folder: string;
  onUploaded: (args: {
    kind: string;
    storagePath: string;
    caption: string;
    metadata: PhotoMetadata;
  }) => Promise<{ ok: boolean; message?: string } | void>;
  label?: string;
  /**
   * Keep the file on the phone when there is no network, and upload it when there is (backlog 185): `key` names the
   * form (`stage:<id>`), `label` says what it is in the banner. Without it, an offline upload fails as before.
   */
  offline?: { key: string; label: string };
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  label ??= t("أضف دليلاً", "Add evidence");
  const [kind, setKind] = useState(kinds[0]?.value ?? "");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const path = usePathname();
  const offlineKey = offline?.key;

  const keptJson = useSyncExternalStore(
    subscribePhotos,
    () => (offlineKey ? photosSnapshot(offlineKey) : "[]"),
    () => "[]",
  );
  const kept = JSON.parse(keptJson) as PhotoSummary[];

  // Sends what this form kept: when the page opens, when the browser says the network is back, and on a slow retry.
  useEffect(() => {
    if (!offlineKey) return;
    let stopped = false;
    const send = async () => {
      await refreshPhotos().catch(() => undefined);
      if (stopped || offlineNow() || photosSnapshot(offlineKey) === "[]") return;
      const supabase = createClient();
      await sendKeptPhotos(
        offlineKey,
        (storagePath, blob, type) =>
          supabase.storage.from("evidence").upload(storagePath, blob, { contentType: type, upsert: false }),
        (item, storagePath) =>
          onUploaded({ kind: item.kind, storagePath, caption: item.caption, metadata: item.metadata }),
      );
    };
    void send();
    window.addEventListener("online", send);
    const timer = window.setInterval(send, RETRY_MS);
    return () => {
      stopped = true;
      window.removeEventListener("online", send);
      window.clearInterval(timer);
    };
    // onUploaded is the form's own action, fixed for the life of this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineKey]);

  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  async function handleUpload() {
    setError(null);
    const file = fileRef.current?.files?.[0];

    if (!file) {
      setError(t("اختر ملفاً أولاً — صورة أو مستند PDF.", "Choose a file first — a photo or a PDF document."));
      return;
    }
    // Checked against the pre-compression ceiling, not the storage limit: a
    // modern phone photo often exceeds ten megabytes and compression will bring
    // it comfortably under. Rejecting it here would turn a solvable problem
    // into a refusal.
    if (file.size > MAX_SOURCE_BYTES) {
      setError(
        t(
          `الملف ${mb(file.size)} ميجابايت، وهو أكبر من أن يُعالَج في المتصفح.`,
          `The file is ${mb(file.size)} MB, too large to process in the browser.`,
        ),
      );
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError(t("الصيغ المقبولة: JPG أو PNG أو WEBP أو HEIC أو PDF.", "Accepted formats: JPG, PNG, WEBP, HEIC or PDF."));
      return;
    }

    setBusy(true);
    setNotice(null);

    // Keeps the file on the phone, under the id given (an upload that already went up keeps its path).
    const keep = async (keptFile: File, keptMetadata: PhotoMetadata, id?: string) => {
      const result = await keepPhotoOffline({
        id,
        key: offline!.key,
        path,
        label: offline!.label,
        folder,
        kind,
        caption: caption.trim() || file.name,
        metadata: keptMetadata,
        file: keptFile,
      });
      const said = keptPhotoMessage(result, t);
      if (said.ok) {
        setNotice(said.message);
        setCaption("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setError(said.message);
      }
    };

    try {
      const supabase = createClient();
      // Offline, nothing can confirm the session with the server; the account the page was rendered for is the owner.
      let userId: string | null = null;
      if (offline && offlineNow()) {
        userId = getOutboxOwner();
      } else {
        try {
          userId = (await supabase.auth.getUser()).data.user?.id ?? null;
        } catch (e) {
          if (!(offline && isNetworkError(e))) throw e;
          userId = getOutboxOwner();
        }
      }
      const user = userId ? { id: userId } : null;

      if (!user) {
        setError(t("انتهت الجلسة — أعد تسجيل الدخول.", "Your session has ended — please sign in again."));
        return;
      }

      /*
       * Read the metadata from the original, then shrink it — in that order.
       *
       * Compression re-encodes the pixels through a canvas, which discards
       * every EXIF tag. The date and coordinates a phone wrote into the photo
       * are the part that makes it evidence rather than a picture, so they are
       * lifted out first and stored as columns. Reading them must never block
       * an upload: a scanned deed has none, and that is fine.
       */
      let metadata: PhotoMetadata = NO_METADATA;
      if (file.type === "image/jpeg") {
        try {
          metadata = readJpegMetadata(await file.arrayBuffer());
        } catch {
          metadata = NO_METADATA;
        }
      }

      const { file: toUpload, compressed, originalBytes } =
        await compressImage(file);

      // Compression is best-effort — a PDF, a HEIC the browser cannot decode,
      // or an already-small file all come back untouched. So the storage limit
      // is enforced against what will actually be sent.
      if (toUpload.size > MAX_BYTES) {
        setError(
          t(
            `الملف ${mb(toUpload.size)} ميجابايت بعد المعالجة، والحد الأقصى 10. جرّب تصويره بدقة أقل أو ارفعه كملف PDF مضغوط.`,
            `The file is ${mb(toUpload.size)} MB after processing; the limit is 10. Try a lower-resolution photo or upload a compressed PDF.`,
          ),
        );
        return;
      }

      // No network: the file waits on the phone (photoOutbox says why its path is fixed now).
      if (offline && offlineNow()) {
        await keep(toUpload, metadata);
        return;
      }

      // The storage policy checks the first path segment against the caller,
      // so the user id must lead.
      const extension = ACCEPTED_EXTENSION[toUpload.type] ?? "jpg";
      const id = offline ? newPhotoId(Date.now()) : crypto.randomUUID();
      const storagePath = offline
        ? storagePathOf({ userId: user.id, folder, id, type: toUpload.type })
        : `${user.id}/${folder}/${id}.${extension}`;

      let uploadError: { message: string } | null;
      try {
        uploadError = (
          await supabase.storage.from("evidence").upload(storagePath, toUpload, {
            contentType: toUpload.type,
            upsert: false,
          })
        ).error;
      } catch (e) {
        if (offline && isNetworkError(e)) {
          await keep(toUpload, metadata, id);
          return;
        }
        throw e;
      }

      if (uploadError && offline && isNetworkError(uploadError)) {
        await keep(toUpload, metadata, id);
        return;
      }

      if (uploadError) {
        setError(t(`تعذّر رفع الملف: ${uploadError.message}`, `Could not upload the file: ${uploadError.message}`));
        return;
      }

      if (compressed) {
        setNotice(
          t(
            `تم ضغط الصورة من ${mb(originalBytes)} إلى ${mb(toUpload.size)} ميجابايت قبل الرفع.`,
            `The photo was compressed from ${mb(originalBytes)} to ${mb(toUpload.size)} MB before upload.`,
          ),
        );
      }

      let result: { ok: boolean; message?: string } | void;
      try {
        result = await onUploaded({
          kind,
          storagePath,
          caption: caption.trim() || file.name,
          metadata,
        });
      } catch (e) {
        // The file is up and the record never reached the server: kept under the same id, the next try finds the
        // file there and records it.
        if (offline && isNetworkError(e)) {
          await keep(toUpload, metadata, id);
          return;
        }
        throw e;
      }

      if (result && !result.ok) {
        setError(result.message ?? t("تعذّر حفظ الدليل.", "Could not save the evidence."));
        return;
      }

      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("خطأ غير متوقع أثناء الرفع.", "Unexpected error during upload."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {kinds.length > 1 && (
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={field}
          >
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="max-w-[13rem] text-xs file:me-2 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm"
        />

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t("وصف مختصر", "Short description")}
          className={field}
        />

        <button
          type="button"
          onClick={handleUpload}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("جارٍ الرفع...", "Uploading...") : label}
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {kept.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-border p-2 text-xs" role="status">
          {kept.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
              {k.status === "refused" ? (
                <span className="text-danger">
                  {t("رُفض حين أُرسل:", "Refused when sent:")} <span dir="auto">{k.caption}</span>
                  {k.message ? <> — {k.message}</> : null}
                </span>
              ) : (
                <span>
                  {t("محفوظ على هاتفك وينتظر الشبكة:", "Kept on your phone, waiting for the network:")}{" "}
                  <span dir="auto">{k.caption}</span> ({mb(k.size)} {t("ميجابايت", "MB")})
                </span>
              )}
              <button type="button" onClick={() => void dropPhoto(k.id)} className="text-muted underline">
                {t("احذفه", "Remove it")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="text-xs text-primary">{notice}</p>}
      <p className="text-xs text-muted">
        {t(
          "الصور المأخوذة بالهاتف في الموقع أقوى دليل — تحمل تاريخها وغالباً إحداثياتها، ونحفظهما مع الملف. تُصغَّر الصور تلقائياً قبل الرفع لتسريعه على الشبكات الضعيفة.",
          "Photos taken by phone on site are the strongest evidence — they carry their date and often their coordinates, and we keep both with the file. Photos are shrunk automatically before upload to speed it up on weak networks.",
        )}
      </p>
    </div>
  );
}
