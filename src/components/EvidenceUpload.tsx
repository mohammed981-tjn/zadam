"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface EvidenceKind {
  value: string;
  label: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

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
  label = "أضف دليلاً",
}: {
  kinds: EvidenceKind[];
  /** Sub-folder under the user's own id, e.g. "lands" or "stages". */
  folder: string;
  onUploaded: (args: {
    kind: string;
    storagePath: string;
    caption: string;
  }) => Promise<{ ok: boolean; message?: string } | void>;
  label?: string;
}) {
  const [kind, setKind] = useState(kinds[0]?.value ?? "");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  async function handleUpload() {
    setError(null);
    const file = fileRef.current?.files?.[0];

    if (!file) {
      setError("اختر ملفاً أولاً — صورة أو مستند PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `الملف ${(file.size / 1048576).toFixed(1)} ميجابايت، والحد الأقصى 10.`,
      );
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError("الصيغ المقبولة: JPG أو PNG أو WEBP أو HEIC أو PDF.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("انتهت الجلسة — أعد تسجيل الدخول.");
        return;
      }

      // The storage policy checks the first path segment against the caller,
      // so the user id must lead.
      const extension = ACCEPTED_EXTENSION[file.type];
      const path = `${user.id}/${folder}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`تعذّر رفع الملف: ${uploadError.message}`);
        return;
      }

      const result = await onUploaded({
        kind,
        storagePath: path,
        caption: caption.trim() || file.name,
      });

      if (result && !result.ok) {
        setError(result.message ?? "تعذّر حفظ الدليل.");
        return;
      }

      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع أثناء الرفع.");
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
          placeholder="وصف مختصر"
          className={field}
        />

        <button
          type="button"
          onClick={handleUpload}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "جارٍ الرفع..." : label}
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-muted">
        الصور المأخوذة بالهاتف في الموقع أقوى دليل — تحمل تاريخها وغالباً
        إحداثياتها.
      </p>
    </div>
  );
}
