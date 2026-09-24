"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";

/**
 * Approves a submission and publishes it. The database trigger checks the
 * documentation and approval state again, so a bug here cannot put an
 * undocumented project on the public listing.
 */
export async function approveOpportunity(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  await supabase
    .from("projects")
    .update({ review_status: "approved", status: "open", review_note: null })
    .eq("id", id);

  revalidatePath("/admin/review");
  revalidatePath("/");
}

export async function rejectOpportunity(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  await supabase
    .from("projects")
    .update({ review_status: "rejected", review_note: note || null })
    .eq("id", id);

  revalidatePath("/admin/review");
}
