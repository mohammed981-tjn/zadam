"use server";
import { dbText } from "@/lib/dbText";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { LAND_DOCUMENT_KINDS } from "@/lib/landDocuments";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

// القائمةُ نفسُها هي مصدرُ الحقيقة، ومنها تُشتقّ المفاتيحُ المقبولة — فلا
// تفترقان. وهي في `lib/` لا هنا: وحدةُ `"use server"` لا تُصدّر إلّا دوالَّ
// غيرَ متزامنة، وتصديرُ مصفوفةٍ منها يصل مكوّنَ العميل شيئاً ليس مصفوفة.
const KINDS = LAND_DOCUMENT_KINDS.map((k) => k.value);

/**
 * Records an uploaded land document. The plot's documents_on_file is not
 * touched here — a database trigger recomputes it from the stored files, so
 * the count can never say more than the files support.
 */
export async function addLandDocument(args: {
  landId: string;
  kind: string;
  storagePath: string;
  caption: string;
  /** EXIF read in the browser before compression re-encoded the file. */
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  if (!args.landId || !args.storagePath) {
    return { ok: false, message: t("بيانات المستند ناقصة.", "The document details are incomplete.") };
  }
  if (!KINDS.includes(args.kind)) {
    return { ok: false, message: t("نوع مستند غير معروف.", "Unknown document type.") };
  }
  if (!args.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }

  // The row must point at a file that is actually there. See lib/evidenceFile
  // for why a failure to confirm is treated as a failure to upload.
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: t(
        "لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.",
        "We could not find the uploaded file. Upload it again and try once more.",
      ),
    };
  }

  // A document kept offline is sent again if the reply to its first send was lost (backlog 185): the same file on the
  // same land is the document already recorded.
  const { data: already } = await supabase
    .from("land_documents")
    .select("id")
    .eq("land_id", args.landId)
    .eq("storage_path", args.storagePath)
    .limit(1)
    .maybeSingle();
  if (already) return { ok: true };

  const photo = sanitisePhotoMetadata(args.metadata);

  const { error } = await supabase.from("land_documents").insert({
    land_id: args.landId,
    kind: args.kind,
    storage_path: args.storagePath,
    caption: args.caption,
    captured_at: photo.capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    created_by: user.id,
  });

  if (error) return { ok: false, message: await dbText(error.message) };

  revalidatePath("/lands");
  return { ok: true };
}
