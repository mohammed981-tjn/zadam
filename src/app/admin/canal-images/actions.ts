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
 *
 * That reasoning holds and is left as it was. What it does not cover is how a
 * refusal comes back: an UPDATE or DELETE that RLS filters out returns no error
 * and zero rows, so denial and success are the same value. Both actions read
 * only `error` and then redirected with "حُفظ." — a non-admin POSTing straight
 * at the action was told the edit was saved, and a real administrator would get
 * the same false confirmation the day a policy stopped matching. So each write
 * now confirms a row actually moved. That is an outcome check, not a permission
 * check; the boundary stays in the database, where PostgREST callers meet it.
 *
 * Chaining .select() is safe here because arc_canal_images_public_read is
 * `published or is_admin()` — an administrator reads back a row that is still
 * unpublished. (Worth noting against the comment on the insert below, which
 * gives the select policy refusing an unpublished row as its reason.)
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * PostgREST messages name tables, columns, constraints and policies. Those
 * describe the schema to whoever asked, and both actions here were putting them
 * in a query string on a redirect. Same treatment as admin/providers: log the
 * detail, show a fixed line.
 */
function canalError(error: { message: string }, where: string) {
  console.error(`canal-images: ${where} failed`, error);
  return "تعذّر تنفيذ العملية. حاول مرة أخرى.";
}

const REFUSED = "تعذّر تنفيذ العملية — لم يتغيّر شيء. تأكّد أنك ما زلت مسجّل الدخول كمدير.";

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

  if (error) return { ok: false, message: canalError(error, "insert") };

  refresh();
  return { ok: true };
}

export async function updateCanalImage(formData: FormData) {
  const supabase = await createClient();

  const id = str(formData, "image_id");
  if (!id) redirect("/admin/canal-images");

  const order = Number(str(formData, "sort_order"));

  const { data, error } = await supabase
    .from("arc_canal_images")
    .update({
      caption: str(formData, "caption").slice(0, 500),
      credit: str(formData, "credit").slice(0, 200),
      source_url: safeSourceUrl(str(formData, "source_url")),
      published: formData.get("published") === "on",
      sort_order: Number.isFinite(order) ? order : 0,
    })
    .eq("id", id)
    .select("id");

  refresh();

  if (error) {
    redirect(
      `/admin/canal-images?error=${encodeURIComponent(canalError(error, "update"))}`,
    );
  }
  if (!data?.length) {
    redirect(`/admin/canal-images?error=${encodeURIComponent(REFUSED)}`);
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

  const { data, error } = await supabase
    .from("arc_canal_images")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    redirect(
      `/admin/canal-images?error=${encodeURIComponent(canalError(error, "delete"))}`,
    );
  }

  // Stop here when nothing was deleted, before touching the bucket. The order
  // below assumes the row is gone; going on to remove the object while the row
  // survived would produce exactly the broken image on a public page that
  // ordering the two deletes this way was meant to prevent.
  if (!data?.length) {
    redirect(`/admin/canal-images?error=${encodeURIComponent(REFUSED)}`);
  }

  const { error: storageError } = await supabase.storage
    .from("media")
    .remove([path]);

  refresh();

  if (storageError) {
    // The path stays in the message — an orphan nobody can name is an orphan
    // nobody cleans up. The provider's own wording goes to the log instead.
    console.error("canal-images: object left behind after row delete", {
      path,
      storageError,
    });
    redirect(
      `/admin/canal-images?error=${encodeURIComponent(
        `حُذف السجلّ ولم يُحذف الملف (${path}). سُجّل التفصيل للمراجعة.`,
      )}`,
    );
  }
  redirect(`/admin/canal-images?message=${encodeURIComponent("حُذفت الصورة.")}`);
}
