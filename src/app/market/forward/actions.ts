"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";
import { forwardStep as forwardContractStep } from "@/lib/contractSteps";

/**
 * العقد الآجل (البند ١٧٠). كلّ خطوةٍ دالّةٌ في القاعدة تتحقّق من صاحبها وحال العقد وتكتب السجلّ وتُخبر الطرف الآخر؛
 * هنا تُقرأ الحقول وتُعاد الصفحة برسالة.
 */
function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/market/forward", "layout");
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function proposeForward(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const offer = str(fd, "offer_id");
  const family = str(fd, "family") === "1" ? "family=1&" : "";
  const from = offer ? `/market/forward/new?offer=${offer}&${family}` : `/market/forward/new?${family}`;
  const fail = (m: string): never => redirect(`${from}error=${encodeURIComponent(m)}`);
  const quantity = numOrNull(fd, "quantity");
  const price = numOrNull(fd, "price");
  if (!quantity || quantity <= 0) fail(t("اكتب الكميّة.", "Enter the quantity."));
  if (!price || price <= 0) fail(t("اكتب السعر للوحدة.", "Enter the price per unit."));
  if (fd.get("agree") !== "on") fail(t("اقرأ الشروط وأقرّ بها قبل أن تقترح.", "Read the terms and confirm them before proposing."));
  const { data, error } = await supabase.rpc("forward_contract_propose", {
    p_side: str(fd, "side"),
    p_phone: offer ? null : str(fd, "phone"),
    p_offer: offer || null,
    p_crop: str(fd, "crop"),
    p_grade: str(fd, "grade"),
    p_quantity: quantity,
    p_unit: str(fd, "unit"),
    p_tolerance_percent: numOrNull(fd, "tolerance_percent") ?? 5,
    p_price: price,
    p_currency: str(fd, "currency"),
    p_delivery_from: str(fd, "delivery_from") || null,
    p_delivery_to: str(fd, "delivery_to") || null,
    p_delivery_place: str(fd, "delivery_place"),
    p_payment_terms: str(fd, "payment_terms"),
    p_advance_percent: numOrNull(fd, "advance_percent"),
    p_season: str(fd, "season_id") || null,
    p_notes: str(fd, "notes") || null,
    p_consignee_name: str(fd, "consignee_name") || null,
    p_consignee_phone: str(fd, "consignee_phone") || null,
    p_late_pct_week: numOrNull(fd, "late_pct_week"),
    p_late_cap_pct: numOrNull(fd, "late_cap_pct"),
    p_breach_pct: numOrNull(fd, "breach_pct"),
    p_force_majeure: fd.get("force_majeure") === "on",
  });
  if (error) fail(explain(locale, error));
  back(
    `/market/forward/${data as string}`,
    "ok",
    t("وصل الاقتراح إلى الطرف الآخر. يصير العقد ملزماً حين يوقّعه.", "The proposal reached the other side. The contract binds you both once they sign it."),
  );
}

/** One form for every later step: `step` names it, and the function behind it decides whether the caller may take it. */
export async function forwardStep(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "id");
  const page = `/market/forward/${id}`;
  // The step itself — the map from a step's name to its database function — is shared with the phone app's
  // route (src/lib/contractSteps.ts), so the two cannot drift.
  const result = await forwardContractStep(
    supabase,
    id,
    str(fd, "step"),
    {
      reason: str(fd, "reason"),
      deliveredQuantity: numOrNull(fd, "delivered_quantity"),
      deliveredOn: str(fd, "delivered_on"),
      gradeMet: str(fd, "grade_met"),
      penalty: numOrNull(fd, "penalty"),
      penaltyPayer: str(fd, "penalty_payer"),
    },
    { locale, t },
  );
  if (!result.ok) back(page, "error", result.message);
  back(page, "ok", t("تمّ، وأُخبر الطرف الآخر.", "Done, and the other side has been told."));
}
