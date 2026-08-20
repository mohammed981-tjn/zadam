"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const STATUSES = ["new", "planned", "done", "declined"];

/**
 * Replying to a note, setting its status, and deciding whether to publish it.
 *
 * All three in one action because they are one decision. An administrator
 * reading a suggestion decides in a single moment what to say, whether it will
 * be done, and whether it is worth showing to everyone — splitting that into
 * three buttons would mean three round trips through the same reading.
 *
 * Nothing here writes replied_at or replied_by. A trigger stamps both from the
 * session and the clock, so the record of who answered cannot be supplied by
 * whoever sends the form — the same reasoning as provider verification.
 * Clearing the reply text clears the stamp with it.
 */
export async function replyToFeedback(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = str(formData, "feedback_id");
  if (!id) redirect("/admin/feedback");

  const statusRaw = str(formData, "status");
  const reply = str(formData, "admin_reply");

  const { data, error } = await supabase
    .from("feedback")
    .update({
      // Empty means "no reply yet", not an empty reply. The trigger reads null
      // as an instruction to clear the stamp.
      admin_reply: reply ? reply.slice(0, 2000) : null,
      status: STATUSES.includes(statusRaw) ? statusRaw : "new",
      published: formData.get("published") === "on",
    })
    .eq("id", id)
    .select("id");

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");

  if (error) {
    console.error("replyToFeedback failed", { id, error });
    redirect(
      `/admin/feedback?error=${encodeURIComponent("تعذّر حفظ الردّ.")}`,
    );
  }

  // No error and no rows means the write was filtered, not applied.
  if (!data || data.length === 0) {
    console.error("replyToFeedback: no row updated", { id });
    redirect(
      `/admin/feedback?error=${encodeURIComponent(
        "لم يُحفظ شيء — الملاحظة غير موجودة أو لا تملك صلاحية تعديلها.",
      )}`,
    );
  }

  redirect(`/admin/feedback?message=${encodeURIComponent("حُفظ الردّ.")}`);
}

/**
 * Deleting a note outright.
 *
 * Kept for spam, which an open form will attract. It is a real delete rather
 * than a hidden flag: a note nobody will ever act on and nobody may read is not
 * a record worth keeping, and leaving it in the table only makes the admin
 * screen harder to work through.
 */
export async function deleteFeedback(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = str(formData, "feedback_id");
  if (!id) redirect("/admin/feedback");

  const { data, error } = await supabase
    .from("feedback")
    .delete()
    .eq("id", id)
    .select("id");

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");

  if (error) {
    console.error("deleteFeedback failed", { id, error });
    redirect(
      `/admin/feedback?error=${encodeURIComponent("تعذّر حذف الملاحظة.")}`,
    );
  }

  if (!data || data.length === 0) {
    console.error("deleteFeedback: no row deleted", { id });
    redirect(
      `/admin/feedback?error=${encodeURIComponent(
        "لم يُحذف شيء — الملاحظة غير موجودة أو لا تملك صلاحية حذفها.",
      )}`,
    );
  }

  redirect(`/admin/feedback?message=${encodeURIComponent("حُذفت الملاحظة.")}`);
}
