"use server";

import { requireAdmin } from "@/lib/adminGuard";
import { back, explain, str, translator } from "@/lib/supplyActions";

/**
 * The review steps. requireAdmin answers a non-admin at once; the boundary is
 * the database functions, which check is_admin() themselves and refuse a badge
 * that lacks the licence the supplier's categories need.
 */

const PATH = "/admin/suppliers";

export async function reviewSupplier(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const verify = str(fd, "verify") === "true";
  const { error } = await supabase.rpc("supplier_review", {
    p_supplier: str(fd, "supplier_id"),
    p_verify: verify,
    p_note: str(fd, "note"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", verify ? t("وُثّق المورد وظهر في الدليل.", "Supplier verified and now in the directory.") : t("رُدّ الطلب بالسبب المكتوب.", "Returned with the reason written."));
}

export async function setSupplierActiveAdmin(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("supplier_set_active", {
    p_supplier: str(fd, "supplier_id"),
    p_active: str(fd, "active") === "true",
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("حُدّثت حالة المورد.", "Supplier status updated."));
}

export async function reviewCarrier(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const verify = str(fd, "verify") === "true";
  const { error } = await supabase.rpc("carrier_review", {
    p_carrier: str(fd, "carrier_id"),
    p_verify: verify,
    p_note: str(fd, "note"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", verify ? t("وُثّق الناقل.", "Carrier verified.") : t("رُدّ الناقل بالسبب المكتوب.", "Carrier returned with the reason written."));
}

export async function reviewReport(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("product_report_review", {
    p_report: str(fd, "report_id"),
    p_status: str(fd, "status"),
    p_note: str(fd, "note"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("حُدّث البلاغ.", "Report updated."));
}
