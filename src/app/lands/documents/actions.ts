"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";

const KINDS = ["tenure", "photo", "permit", "inspection"];

export const LAND_DOCUMENT_KINDS = [
  { value: "tenure", label: "إثبات حيازة أو عقد إيجار" },
  { value: "photo", label: "صورة للأرض" },
  { value: "permit", label: "تصريح أو موافقة" },
  { value: "inspection", label: "تقرير معاينة" },
];

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

  if (!args.landId || !args.storagePath) {
    return { ok: false, message: "بيانات المستند ناقصة." };
  }
  if (!KINDS.includes(args.kind)) {
    return { ok: false, message: "نوع مستند غير معروف." };
  }
  if (!args.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, message: "مسار ملف غير صالح." };
  }

  // The row must point at a file that is actually there. See lib/evidenceFile
  // for why a failure to confirm is not treated as a failure to upload.
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: "لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.",
    };
  }

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

  if (error) return { ok: false, message: error.message };

  revalidatePath("/lands");
  return { ok: true };
}
