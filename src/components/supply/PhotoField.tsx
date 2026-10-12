"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A photo (or PDF) uploaded straight from the phone to the private evidence
 * bucket, under the uploader's own id — the storage policy checks that first
 * segment, and so do the database functions that take the path. The form
 * around it receives only the path, in a hidden input.
 */
export default function PhotoField({
  name,
  folder,
  label,
  required,
  pdf,
}: {
  name: string;
  folder: string;
  label: string;
  required?: boolean;
  pdf?: boolean;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPath("");
    setMsg(null);
    if (!file) return;
    if (!EXT[file.type] || (!pdf && file.type === "application/pdf")) {
      setMsg(t("صيغةٌ غير مقبولة. صوّر بالهاتف (JPG أو PNG).", "Format not accepted. Take a phone photo (JPG or PNG)."));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMsg(t("سجّل الدخول أولاً.", "Sign in first."));
        return;
      }
      const { file: out } = await compressImage(file);
      if (out.size > MAX_BYTES) {
        setMsg(t("الملفّ أكبر من ١٠ ميجابايت بعد الضغط.", "The file is over 10 MB after compression."));
        return;
      }
      const p = `${user.id}/${folder}/${crypto.randomUUID()}.${EXT[out.type] ?? "jpg"}`;
      const { error } = await supabase.storage.from("evidence").upload(p, out, { contentType: out.type, upsert: false });
      if (error) {
        setMsg(t(`تعذّر الرفع: ${error.message}`, `Upload failed: ${error.message}`));
        return;
      }
      setPath(p);
      setMsg(t("رُفع الملفّ ✓", "Uploaded ✓"));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t("خطأ غير متوقّع.", "Unexpected error."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        type="file"
        accept={pdf ? "image/*,application/pdf" : "image/*"}
        capture={pdf ? undefined : "environment"}
        onChange={onChange}
        disabled={busy}
        className="text-sm file:me-2 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2"
      />
      <input type="hidden" name={name} value={path} required={required} />
      {busy && <span className="text-xs text-muted">{t("جارٍ الرفع…", "Uploading…")}</span>}
      {msg && <span className={`text-xs ${path ? "text-primary" : "text-danger"}`}>{msg}</span>}
    </label>
  );
}
