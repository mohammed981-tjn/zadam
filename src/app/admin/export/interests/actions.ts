"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export interface MarkResult {
  ok: boolean;
  message: string;
}

/**
 * وسمُ الطلب — «تواصلتُ» أو «أُغلق»، مع ملاحظةٍ اختيارية.
 *
 * There is no delete, here or in the database. A request that arrived and then
 * vanished makes "how many buyers asked about gum arabic this quarter?" a
 * question with no answer — and that count is the cheapest market research this
 * platform will ever own. Closed requests stay closed and visible.
 *
 * The stamp — who handled it and when — is written by a database trigger, not
 * here. A screen that forgets to set it produces a row that looks handled and
 * cannot say by whom.
 */
export async function markInterest(
  id: string,
  status: "contacted" | "closed" | "new",
  note: string,
): Promise<MarkResult> {
  const { supabase } = await requireAdmin();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  if (!["contacted", "closed", "new"].includes(status)) {
    return { ok: false, message: t("حالة غير معروفة.", "Unknown status.") };
  }

  const { data, error } = await supabase
    .from("export_offer_interests")
    .update({
      status,
      handled_note: note.trim().slice(0, 1000) || null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("interests: mark failed", error);
    return { ok: false, message: t("تعذّر تحديث الطلب.", "The request could not be updated.") };
  }

  // Zero rows without an error is what a refused policy looks like — the same
  // silent shape this platform has been caught by before.
  if (!data || data.length === 0) {
    return { ok: false, message: t("لم يتغيّر شيء. حدّث الصفحة وأعد المحاولة.", "Nothing changed. Refresh the page and try again.") };
  }

  revalidatePath("/admin/export/interests");
  return { ok: true, message: t("حُفظ.", "Saved.") };
}
