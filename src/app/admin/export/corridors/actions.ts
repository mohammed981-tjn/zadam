"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * تسجيلُ مراجعةٍ على قواعد ممرّ.
 *
 * WHY THE SOURCE IS MANDATORY AND CHECKED IN THE DATABASE TOO
 *
 * "I checked these" is a claim; "I checked these against EU regulation 2026/45"
 * is something a second person can verify. A review log whose entries do not say
 * what they were checked against records that somebody clicked a button, which
 * is not diligence and should not be shown to a farmer as though it were.
 *
 * The ten-character minimum is a CHECK constraint on the column as well as a
 * guard here. This runs on our server and that runs in the database; only the
 * second is out of reach of a request nobody sent through this form.
 */
export async function recordCorridorReview(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") return;

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const corridorId = str(formData, "corridor_id");
  const note = str(formData, "source_note");
  const outcome = str(formData, "outcome") === "amended" ? "amended" : "unchanged";

  if (note.length < 10) {
    redirect(
      `/admin/export/corridors?error=${encodeURIComponent(
        t(
          "اكتب المصدر الذي راجعتَ عليه — عشرة أحرف على الأقل. «تمّ» ليست مراجعة.",
          "Write the source you checked against — at least ten characters. “Done” is not a review.",
        ),
      )}`,
    );
  }

  const { data, error } = await supabase
    .from("export_corridor_reviews")
    .insert({
      corridor_id: corridorId,
      reviewed_by: user.id,
      source_note: note,
      outcome,
    })
    .select("id");

  if (error) {
    console.error("corridor review: insert failed", error);
    redirect(
      `/admin/export/corridors?error=${encodeURIComponent(t("تعذّر تسجيل المراجعة.", "The review could not be recorded."))}`,
    );
  }

  // صفرُ صفوفٍ بلا خطأ هو ما تبدو عليه سياسةٌ رفضت الكتابة.
  if (!data || data.length === 0) {
    redirect(
      `/admin/export/corridors?error=${encodeURIComponent(
        t("لم تُسجَّل المراجعة — الصلاحيةُ مرفوضة.", "The review was not recorded — permission denied."),
      )}`,
    );
  }

  revalidatePath("/admin/export/corridors");
  revalidatePath("/export/market");
}
