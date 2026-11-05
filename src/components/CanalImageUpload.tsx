"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/**
 * Uploads one image to the public media bucket and records it.
 *
 * The file goes from the browser straight to storage, so a five-megabyte photo
 * is never base64-encoded into a server-action body; only the resulting path
 * reaches the action that writes the row. The same shape as EvidenceUpload,
 * with two deliberate differences.
 *
 * FIRST: THE PATH DOES NOT START WITH A USER ID
 *
 * The evidence bucket's policy checks that the first segment of the object name
 * equals the uploader's id, because a farmer's photograph belongs to that
 * farmer. These images belong to the platform — an administrator uploads them
 * on its behalf, and the next administrator must be able to replace one. So the
 * policy checks is_admin() and the path is organised by subject.
 *
 * SECOND: THE CREDIT FIELD IS REQUIRED HERE, NOT OPTIONAL
 *
 * The page these appear on publishes nothing without a basis. For a photograph
 * the basis is who made it. The form refuses to upload without one, so an
 * uncredited image never reaches storage in the first place — a check after the
 * upload would leave orphaned objects behind every time someone changed their
 * mind.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

const ACCEPTED_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const ACCEPTED = Object.keys(ACCEPTED_EXTENSION);

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

export default function CanalImageUpload({
  onUploaded,
}: {
  onUploaded: (args: {
    storagePath: string;
    caption: string;
    credit: string;
    sourceUrl: string;
    takenOn: string;
  }) => Promise<{ ok: boolean; message?: string } | void>;
}) {
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [takenOn, setTakenOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  async function handleUpload() {
    setError(null);
    setNotice(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("اختر صورة أولاً.", "Choose an image first."));
      return;
    }
    if (!caption.trim()) {
      setError(t("اكتب وصفاً للصورة — الصورة بلا وصف لا تشرح شيئاً.", "Write a caption — an image without one explains nothing."));
      return;
    }
    if (!credit.trim()) {
      setError(
        t(
          "اكتب مصدر الصورة أو مُلتقِطها. لا تُنشر على هذه الصفحة صورة بلا سند.",
          "Write the image's source or photographer. No image without a basis is published on this page.",
        ),
      );
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(t(`الملف ${mb(file.size)} ميجابايت، وهو أكبر من أن يُعالَج.`, `The file is ${mb(file.size)} MB, too large to process.`));
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError(t("الصيغ المقبولة: JPG أو PNG أو WEBP.", "Accepted formats: JPG, PNG or WEBP."));
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { file: toUpload, compressed, originalBytes } =
        await compressImage(file);

      if (toUpload.size > MAX_BYTES) {
        setError(
          t(
            `الملف ${mb(toUpload.size)} ميجابايت بعد المعالجة، والحد الأقصى 10.`,
            `The file is ${mb(toUpload.size)} MB after processing; the limit is 10.`,
          ),
        );
        return;
      }

      const extension = ACCEPTED_EXTENSION[toUpload.type] ?? "jpg";
      const path = `canal/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, toUpload, {
          contentType: toUpload.type,
          upsert: false,
          // A year: these are static illustrations, and the file name carries a
          // uuid, so a changed image is a new object rather than a stale cache.
          cacheControl: "31536000",
        });

      if (uploadError) {
        setError(t(`تعذّر رفع الصورة: ${uploadError.message}`, `Could not upload the image: ${uploadError.message}`));
        return;
      }

      const result = await onUploaded({
        storagePath: path,
        caption: caption.trim(),
        credit: credit.trim(),
        sourceUrl: sourceUrl.trim(),
        takenOn: takenOn,
      });

      if (result && !result.ok) {
        setError(result.message ?? t("رُفعت الصورة ولم يُحفظ سجلّها.", "The image was uploaded but its record was not saved."));
        return;
      }

      setNotice(
        compressed
          ? t(
              `رُفعت، وضُغطت من ${mb(originalBytes)} إلى ${mb(toUpload.size)} ميجابايت.`,
              `Uploaded, compressed from ${mb(originalBytes)} to ${mb(toUpload.size)} MB.`,
            )
          : t("رُفعت الصورة.", "Image uploaded."),
      );
      setCaption("");
      setCredit("");
      setSourceUrl("");
      setTakenOn("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("خطأ غير متوقّع أثناء الرفع.", "Unexpected error during upload."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("الصورة", "Image")}</span>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="text-xs file:me-2 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("تاريخ الالتقاط", "Date taken")}</span>
          <input
            type="date"
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
            className={field}
          />
          <span className="text-xs text-muted">
            {t(
              "اتركه فارغاً إن كان مجهولاً — تاريخٌ مخترع أسوأ من لا تاريخ.",
              "Leave it blank if unknown — an invented date is worse than none.",
            )}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">{t("الوصف", "Caption")}</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("ماذا تُظهر الصورة، وأين", "What the image shows, and where")}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("المصدر أو المُلتقِط ★", "Source or photographer ★")}</span>
          <input
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            placeholder={t("اسم المصوّر، أو الجهة، أو الترخيص", "Photographer's name, organisation, or licence")}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("رابط المصدر", "Source link")}</span>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            className={field}
            dir="ltr"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("جارٍ الرفع...", "Uploading...") : t("ارفع الصورة", "Upload image")}
        </button>
        <p className="text-xs text-muted">
          {t(
            "تُرفع غير منشورة. النشر قرار ثانٍ، من القائمة أدناه.",
            "Uploaded unpublished. Publishing is a second decision, from the list below.",
          )}
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}
    </div>
  );
}
