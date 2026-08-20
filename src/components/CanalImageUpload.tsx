"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";

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

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  async function handleUpload() {
    setError(null);
    setNotice(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("اختر صورة أولاً.");
      return;
    }
    if (!caption.trim()) {
      setError("اكتب وصفاً للصورة — الصورة بلا وصف لا تشرح شيئاً.");
      return;
    }
    if (!credit.trim()) {
      setError(
        "اكتب مصدر الصورة أو مُلتقِطها. لا تُنشر على هذه الصفحة صورة بلا سند.",
      );
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(`الملف ${mb(file.size)} ميجابايت، وهو أكبر من أن يُعالَج.`);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError("الصيغ المقبولة: JPG أو PNG أو WEBP.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { file: toUpload, compressed, originalBytes } =
        await compressImage(file);

      if (toUpload.size > MAX_BYTES) {
        setError(
          `الملف ${mb(toUpload.size)} ميجابايت بعد المعالجة، والحد الأقصى 10.`,
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
        setError(`تعذّر رفع الصورة: ${uploadError.message}`);
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
        setError(result.message ?? "رُفعت الصورة ولم يُحفظ سجلّها.");
        return;
      }

      setNotice(
        compressed
          ? `رُفعت، وضُغطت من ${mb(originalBytes)} إلى ${mb(toUpload.size)} ميجابايت.`
          : "رُفعت الصورة.",
      );
      setCaption("");
      setCredit("");
      setSourceUrl("");
      setTakenOn("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقّع أثناء الرفع.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">الصورة</span>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="text-xs file:me-2 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">تاريخ الالتقاط</span>
          <input
            type="date"
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
            className={field}
          />
          <span className="text-xs text-muted">
            اتركه فارغاً إن كان مجهولاً — تاريخٌ مخترع أسوأ من لا تاريخ.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">الوصف</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="ماذا تُظهر الصورة، وأين"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">المصدر أو المُلتقِط ★</span>
          <input
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            placeholder="اسم المصوّر، أو الجهة، أو الترخيص"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">رابط المصدر</span>
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
          {busy ? "جارٍ الرفع..." : "ارفع الصورة"}
        </button>
        <p className="text-xs text-muted">
          تُرفع غير منشورة. النشر قرار ثانٍ، من القائمة أدناه.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}
    </div>
  );
}
