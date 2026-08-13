"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("land_documents").insert({
    land_id: args.landId,
    kind: args.kind,
    storage_path: args.storagePath,
    caption: args.caption,
    created_by: user.id,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/lands");
  return { ok: true };
}
