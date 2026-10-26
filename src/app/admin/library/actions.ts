"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * مراجعة مكتبة الدراسات (البند ٢٠٢): نشرُ عملٍ أو ردّه بسبب. `research_review` تتحقّق أنّ المنادي مدير، وتُخبر المرسِل.
 */
function done(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/library");
  revalidatePath("/library");
  redirect(`/admin/library?${key}=${encodeURIComponent(message)}`);
}

export async function reviewResearch(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const publish = str(fd, "decision") === "publish";
  const { error } = await supabase.rpc("research_review", {
    p_id: str(fd, "id"),
    p_publish: publish,
    p_note: str(fd, "note") || null,
  });
  if (error) done("error", explain(locale, error));
  done("ok", publish ? t("نُشر في المكتبة.", "Published in the library.") : t("رُدّ إلى مرسِله بالسبب.", "Returned to its sender with the reason."));
}
