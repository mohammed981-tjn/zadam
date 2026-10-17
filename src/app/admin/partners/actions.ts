"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { explain, str, translator } from "@/lib/supplyActions";

/**
 * The review steps. requireAdmin answers a non-admin at once; the boundary is
 * the database functions, which check is_admin() themselves and refuse a
 * badge without a commercial registration, or an agreement for an
 * unverified company.
 */

const PATH = "/admin/partners";

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/partners", "layout");
  revalidatePath(PATH);
  redirect(`${PATH}?${key}=${encodeURIComponent(message)}`);
}

export async function reviewPartner(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const verify = str(fd, "verify") === "true";
  const { error } = await supabase.rpc("partner_review", {
    p_company: str(fd, "company_id"),
    p_verify: verify,
    p_note: str(fd, "note"),
  });
  if (error) back("error", explain(locale, error));
  back("ok", verify ? t("وُثّقت الشركة وظهرت في الدليل.", "Company verified and now listed.") : t("رُدّ الطلب بالسبب المكتوب.", "Returned with the reason written."));
}

export async function setPartnerActiveAdmin(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_set_active", {
    p_company: str(fd, "company_id"),
    p_active: str(fd, "active") === "true",
  });
  if (error) back("error", explain(locale, error));
  back("ok", t("حُدّثت حالة الشركة.", "Company status updated."));
}

export async function activateAgreement(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_agreement_activate", { p_id: str(fd, "agreement_id") });
  if (error) back("error", explain(locale, error));
  back("ok", t("فُعّل الاتّفاق، وبدأت المزارع المطابقة تظهر للشركة.", "Agreement activated; matching farms now appear for the company."));
}

export async function endAgreementAdmin(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_agreement_end", { p_id: str(fd, "agreement_id") });
  if (error) back("error", explain(locale, error));
  back("ok", t("أُنهي الاتّفاق.", "Agreement ended."));
}
