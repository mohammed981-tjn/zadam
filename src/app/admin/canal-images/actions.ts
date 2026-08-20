"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeSourceUrl } from "@/lib/media";

/**
 * Recording, editing and removing the canal page's images.
 *
 * Nothing here checks that the caller is an administrator, and that is
 * deliberate rather than an omission: row-level security on arc_canal_images
 * and the storage policy on the media bucket both call is_admin(), so a
 * non-admin request fails at the database with nothing written. A check here as
 * well would suggest the check here is what protects it.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  revalidatePath("/admin/canal-images");
  revalidatePath("/arc-canal");
}

export interface UploadResult {
  ok: boolean;
  message?: string;
}

/** Called by the client uploader once the object is in the bucket. */
export async function recordCanalImage(args: {
  storagePath: string;
  caption: string;
  credit: string;
  sourceUrl: string;
  takenOn: string;
}): Promise<UploadResult> {
  if (!args.storagePath.startsWith("canal/")) {
    return { ok: false, message: "مسار غير متوقّع." };
  }
  if (!args.caption.trim() || !args.credit.trim()) {
    return { ok: false, message: "الوصف والمصدر مطلوبان." };
  }

  const supabase = await createClient();

  // No .select() chained on: the insert policy would let the row in and the
  // select policy would refuse it on the way out (published defaults to false),
  // rolling back a write that had succeeded and reporting it as a policy
  // violation. The row's identity is not needed here.
  const { error } = await supabase.from("arc_canal_images").insert({
    storage_path: args.storagePath,
    caption: args.caption.slice(0, 500),
    credit: args.credit.slice(0, 200),
    source_url: safeSourceUrl(args.sourceUrl),
    taken_on: args.takenOn || null,
  });

  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true };
}

export async function updateCanalImage(formData: FormData) {
  const supabase = await createClient();

  const id = str(formData, "image_id");
  if (!id) redirect("/admin/canal-images");

  const order = Number(str(formData, "sort_order"));

  const { error } = await supabase
    .from("arc_canal_images")
    .update({
      caption: str(formData, "caption").slice(0, 500),
      credit: str(formData, "credit").slice(0, 200),
      source_url: safeSourceUrl(str(formData, "source_url")),
      published: formData.get("published") === "on",
      sort_order: Number.isFinite(order) ? order : 0,
    })
    .eq("id", id);

  refresh();

  if (error) {
    redirect(`/admin/canal-images?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/admin/canal-images?message=${encodeURIComponent("حُفظ.")}`);
}

/**
 * Deletes the row and the object, in that order.
 *
 * Row first because a row pointing at a missing file renders a broken image on
 * a public page, while an object with no row is invisible and costs a few
 * hundred kilobytes. If the storage delete fails the row is already gone and
 * the page is correct; the orphan is reported rather than silently swallowed,
 * so it can be cleaned up.
 */
export async function deleteCanalImage(formData: FormData) {
  const supabase = await createClient();

  const id = str(formData, "image_id");
  const path = str(formData, "storage_path");
  if (!id) redirect("/admin/canal-images");

  const { error } = await supabase
    .from("arc_canal_images")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`/admin/canal-images?error=${encodeURIComponent(error.message)}`);
  }

  const { error: storageError } = await supabase.storage
    .from("media")
    .remove([path]);

  refresh();

  if (storageError) {
    redirect(
      `/admin/canal-images?error=${encodeURIComponent(
        `حُذف السجلّ ولم يُحذف الملف (${path}): ${storageError.message}`,
      )}`,
    );
  }
  redirect(`/admin/canal-images?message=${encodeURIComponent("حُذفت الصورة.")}`);
}
