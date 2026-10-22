"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices } from "@/lib/priceRefresh";

/**
 * The administrators' two acts on prices (backlog 131): publish or reject a
 * held figure, and run the daily reading now instead of waiting for the night.
 */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/prices");
  revalidatePath("/admin/inbox");
  revalidatePath("/rates");
  revalidatePath("/market");
  redirect(`/admin/prices?${key}=${encodeURIComponent(message)}`);
}

export async function reviewQuote(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const publish = str(fd, "publish") === "true";
  const { error } = await supabase.rpc("market_quote_review", { p_id: str(fd, "quote_id"), p_publish: publish });
  if (error) back("error", explain(locale, error));
  back("ok", publish ? t("نُشر الرقم، وصار يظهر في الصفحات.", "Published; the pages now show it.") : t("رُفض الرقم ولن يظهر.", "Rejected; it will not be shown."));
}

export async function runPricesNow() {
  const { supabase, user } = await signedIn();
  const { t } = await translator();
  // The run writes as the project, so the caller must be an administrator first.
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") back("error", t("للإدارة وحدها.", "Administrators only."));
  const admin = createAdminClient();
  if (!admin) back("error", t("مفتاح الخادم غير مضبوط على هذا النشر.", "The server key is not set on this deployment."));
  const s = await refreshPrices(admin, "admin");
  back(
    s.errors.length && s.found === 0 ? "error" : "ok",
    t(
      `قُرئت المصادر: ${s.found} رقماً جديداً — نُشر ${s.published} وحُجز ${s.held} للمراجعة.${s.errors.length ? ` تعذّر ${s.errors.length} مصدراً.` : ""}`,
      `Sources read: ${s.found} new figures — ${s.published} published, ${s.held} held for review.${s.errors.length ? ` ${s.errors.length} sources failed.` : ""}`,
    ),
  );
}
