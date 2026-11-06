"use server";

import { createPlanFromStudyCore } from "@/lib/studyProject";
import { back, explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * «مشروعي». Every step is a database function that checks who is taking it
 * (supabase/migrations/20261020130000_input_plans.sql). None of them moves
 * money: the farmer pays the supplier directly and records it here.
 */

const PATH = "/my-project";
const today = () => new Date().toISOString().slice(0, 10);
const isoDay = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** From the feasibility study: the list is built here from the crop's sources, not taken from the browser. */
export async function createPlanFromStudy(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  // The checks and the database step live in lib/studyProject.ts, shared with the phone app's route.
  const done = await createPlanFromStudyCore(
    supabase,
    { crop: str(fd, "crop"), feddans: numOrNull(fd, "feddans"), title: str(fd, "title"), landId: str(fd, "land_id") || null },
    locale,
  );
  back(PATH, done.ok ? "ok" : "error", done.message);
}

export async function addPlanItem(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const quantity = numOrNull(fd, "quantity");
  if (!str(fd, "name") || quantity === null || quantity <= 0 || !str(fd, "unit"))
    back(PATH, "error", t("اكتب اسم البند وكمّيّته ووحدته.", "Enter the item's name, quantity and unit."));
  const { error } = await supabase.rpc("input_plan_item_add", {
    p_plan: str(fd, "plan_id"),
    p_name: str(fd, "name"),
    p_note: str(fd, "note"),
    p_quantity: quantity,
    p_unit: str(fd, "unit"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("أُضيف البند.", "Item added."));
}

export async function setPlanItem(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const quantity = numOrNull(fd, "quantity");
  const price = numOrNull(fd, "unit_price_usd");
  if (quantity === null || quantity <= 0) back(PATH, "error", t("الكمّيّة رقمٌ أكبر من صفر.", "The quantity must be above zero."));
  if (price !== null && price < 0) back(PATH, "error", t("السعر لا يكون سالباً.", "A price cannot be negative."));
  const { error } = await supabase.rpc("input_plan_item_set", {
    p_item: str(fd, "item_id"),
    p_quantity: quantity,
    p_unit_price_usd: price,
    p_supplier: str(fd, "supplier"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("حُفظ البند.", "Item saved."));
}

export async function removePlanItem(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("input_plan_item_remove", { p_item: str(fd, "item_id") });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("أُزيل البند من القائمة، وبقي في السجلّ.", "The item was taken off the list and stays in the record."));
}

export async function approvePlan(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("input_plan_approve", { p_plan: str(fd, "plan_id") });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("وافقتَ على القائمة. ادفع لكلّ مورد مباشرةً، وسجّل هنا ما دفعت.", "You approved the list. Pay each supplier directly, and record here what you paid."));
}

export async function recordPaid(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const paid = numOrNull(fd, "paid_sdg");
  const day = isoDay(str(fd, "paid_at")) ?? today();
  if (paid === null || paid <= 0) back(PATH, "error", t("اكتب المبلغ الذي دفعته بالجنيه.", "Enter the amount you paid, in pounds."));
  const { error } = await supabase.rpc("input_plan_item_paid", {
    p_item: str(fd, "item_id"),
    p_paid_sdg: paid,
    p_paid_at: day,
    p_ref: str(fd, "paid_ref"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("سُجّل ما دفعته للمورد.", "Your payment to the supplier is recorded."));
}

export async function recordDelivered(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("input_plan_item_delivered", {
    p_item: str(fd, "item_id"),
    p_delivered_at: isoDay(str(fd, "delivered_at")) ?? today(),
    p_note: str(fd, "delivery_note"),
  });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("سُجّل الاستلام.", "Delivery recorded."));
}

export async function closePlan(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("input_plan_close", { p_plan: str(fd, "plan_id") });
  if (error) back(PATH, "error", explain(locale, error));
  back(PATH, "ok", t("أُقفلت الخطّة. تبقى في سجلّك كما هي.", "The plan is closed. It stays in your record as it is."));
}
