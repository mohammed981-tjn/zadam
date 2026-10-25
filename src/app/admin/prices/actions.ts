"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices } from "@/lib/priceRefresh";

/**
 * The administrators' acts on prices (backlog 131, 196): publish or reject a
 * held figure, approve in one click everything the platform read with
 * certainty, erase a figure (the only erasure there is: what is read is kept),
 * and run the daily reading now instead of waiting for the night.
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

export async function approveAllAwaiting(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  // The figures the page listed, and only those (backlog 198 C12): one read after the page opened waits for the next look.
  const ids = fd.getAll("quote_id").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) back("error", t("لا شيء ينتظر الاعتماد.", "Nothing is waiting for approval."));
  const { data, error } = await supabase.rpc("market_quote_review_all", { p_ids: ids });
  if (error) back("error", explain(locale, error));
  const n = Number(data ?? 0);
  back(
    "ok",
    n > 0
      ? t(`اعتُمد ${n} رقماً، وصار يظهر في الصفحات.`, `${n} figure(s) approved; the pages now show them.`)
      : t("لا شيء ينتظر الاعتماد.", "Nothing is waiting for approval."),
  );
}

export async function eraseQuote(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const reason = str(fd, "reason").trim();
  if (reason.length < 3 || reason.length > 300) back("error", t("اكتب سبب المحو (٣ أحرفٍ فأكثر).", "Write the reason for erasing (3 characters or more)."));
  const { error } = await supabase.rpc("market_quote_erase", { p_id: str(fd, "quote_id"), p_reason: reason });
  if (error) back("error", explain(locale, error));
  back("ok", t("مُحي الرقم، وبقيت لقطةٌ به في سجلّ المحو.", "The figure was erased; a snapshot of it stays in the erasure log."));
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
      `قُرئت المصادر: ${s.found} رقماً جديداً حُجزت بانتظار اعتمادك — لم يُنشر شيءٌ بعد.${s.errors.length ? ` تعذّر ${s.errors.length} مصدراً.` : ""}`,
      `Sources read: ${s.found} new figures, held for your approval — nothing is published yet.${s.errors.length ? ` ${s.errors.length} sources failed.` : ""}`,
    ),
  );
}
