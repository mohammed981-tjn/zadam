"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";

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
  const step = str(fd, "step");
  const reason = str(fd, "reason");
  const calls: Record<string, () => PromiseLike<{ error: { code?: string; message?: string } | null }>> = {
    sign: () => supabase.rpc("forward_contract_answer", { p_id: id, p_sign: true }),
    decline: () => supabase.rpc("forward_contract_answer", { p_id: id, p_sign: false }),
    withdraw: () => supabase.rpc("forward_contract_withdraw", { p_id: id }),
    deliver: () =>
      supabase.rpc("forward_contract_deliver", {
        p_id: id,
        p_quantity: numOrNull(fd, "delivered_quantity"),
        p_on: str(fd, "delivered_on") || null,
        p_grade_met: str(fd, "grade_met") === "yes" ? true : str(fd, "grade_met") === "no" ? false : null,
        p_note: reason || null,
      }),
    confirm: () => supabase.rpc("forward_contract_confirm", { p_id: id }),
    cancel: () => supabase.rpc("forward_contract_cancel_request", { p_id: id, p_reason: reason }),
    cancel_yes: () => supabase.rpc("forward_contract_cancel_answer", { p_id: id, p_agree: true }),
    cancel_no: () => supabase.rpc("forward_contract_cancel_answer", { p_id: id, p_agree: false }),
    dispute: () => supabase.rpc("forward_contract_dispute", { p_id: id, p_reason: reason }),
    resume: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "resume", p_note: reason }),
    close_done: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "completed", p_note: reason }),
    close_cancel: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "cancelled", p_note: reason }),
  };
  const call = calls[step];
  if (!call) back(page, "error", t("خطوةٌ غير معروفة.", "Unknown step."));
  const { error } = await call();
  if (error) back(page, "error", explain(locale, error));
  back(page, "ok", t("تمّ، وأُخبر الطرف الآخر.", "Done, and the other side has been told."));
}
