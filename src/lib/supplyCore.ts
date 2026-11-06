import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { SUDAN_STATES } from "@/lib/nafir";
import { CATEGORIES, INPUT_KEYS, PACK_UNITS, normalizePhone } from "@/lib/supplyChain";
import { explain } from "@/lib/supplyActions";

/**
 * The supply steps (supabase/migrations/20261012130000_supply_chain.sql), each a database function that checks who
 * is taking it, with the few checks that turn an obviously incomplete form into a sentence before the round trip.
 *
 * One body for both doors (backlog 203): the website's server actions (src/app/suppliers/actions.ts) read a form and
 * send the person back to the page with ?ok= / ?error=; the app's routes (src/app/api/app/suppliers/**) read JSON and
 * answer with it. Both pass the caller's own client, so row-level security and the functions' own checks decide, and
 * both get the same words back. The first problem found is the one returned, as the website's redirect did.
 */

/** What a step's input looks like, whether it came as a form or as JSON. */
export interface Fields {
  /** A text field, trimmed; "" when absent. */
  str(k: string): string;
  /** Every value of a repeated field (checkboxes, the lines of an order). */
  all(k: string): string[];
  /** A number, Arabic digits accepted; null when empty or not a number. */
  num(k: string): number | null;
}

const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const parseNum = (s: string) => {
  if (!s) return null;
  const n = Number(latinDigits(s));
  return Number.isFinite(n) ? n : null;
};

export function formFields(fd: FormData): Fields {
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  return { str, all: (k) => fd.getAll(k).map(String), num: (k) => parseNum(str(k)) };
}

export function jsonFields(body: Record<string, unknown>): Fields {
  const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
  const str = (k: string) => text(body[k]).trim();
  return {
    str,
    all: (k) => (Array.isArray(body[k]) ? (body[k] as unknown[]).map((v) => text(v)) : body[k] === undefined ? [] : [text(body[k])]),
    num: (k) => (typeof body[k] === "number" && Number.isFinite(body[k]) ? (body[k] as number) : parseNum(str(k))),
  };
}

export type StepResult = { ok: true; message: string; id?: string; code?: string } | { ok: false; message: string };

const isState = (s: string) => (SUDAN_STATES as readonly string[]).includes(s);
const states = (f: Fields, k: string) => f.all(k).filter(isState);
const phoneOk = (p: string) => /^\+?[0-9]{7,15}$/.test(p);
const translate = (locale: Locale) => (ar: string, en: string) => tr(locale, ar, en);
const refused = (message: string): StepResult => ({ ok: false, message });
const done = (message: string, extra: { id?: string; code?: string } = {}): StepResult => ({ ok: true, message, ...extra });

async function step(
  supabase: SupabaseClient,
  locale: Locale,
  fn: string,
  args: Record<string, unknown>,
  ok: string,
): Promise<StepResult> {
  const { error } = await supabase.rpc(fn, args);
  return error ? refused(explain(locale, error)) : done(ok);
}

// ── المورد ──────────────────────────────────────────────────────────────────

export async function saveSupplierStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const phone = normalizePhone(f.str("phone"));
  const whatsapp = normalizePhone(f.str("whatsapp"));
  const categories = f.all("categories").filter((c) => (CATEGORIES as readonly string[]).includes(c));
  if (!isState(f.str("state"))) return refused(t("اختر الولاية.", "Choose the state."));
  if (!phoneOk(phone)) return refused(t("اكتب رقم هاتفٍ صحيحاً.", "Enter a valid phone number."));
  if (whatsapp && !phoneOk(whatsapp)) return refused(t("رقم واتساب غير صحيح.", "The WhatsApp number is not valid."));
  if (categories.length === 0) return refused(t("اختر ما تبيعه.", "Choose what you sell."));
  return step(
    supabase,
    locale,
    "supplier_save",
    {
      p_name: f.str("name"),
      p_state: f.str("state"),
      p_locality: f.str("locality"),
      p_phone: phone,
      p_whatsapp: whatsapp,
      p_delivery_states: states(f, "delivery_states"),
      p_categories: categories,
      p_pesticide_licence: f.str("pesticide_licence_no"),
      p_seed_registration: f.str("seed_registration_no"),
      p_commercial_registration: f.str("commercial_registration_no"),
      p_bio: f.str("bio"),
    },
    t("حُفظت بيانات المورد. ارفع صورة المستندات ليراجعها المشرف.", "Supplier details saved. Upload a photo of the documents for review."),
  );
}

export async function setSupplierDocumentStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const doc = f.str("doc_path");
  if (!doc) return refused(t("ارفع صورة المستندات أولاً، وانتظر علامة ✓.", "Upload the document photo first and wait for the ✓."));
  return step(
    supabase,
    locale,
    "supplier_set_document",
    { p_path: doc },
    t("وصلت المستندات. يراجعها المشرف ثمّ تظهر شارة «موثّق».", "Documents received. An administrator will review them, then the “Verified” badge appears."),
  );
}

export async function setSupplierActiveStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "supplier_set_active",
    { p_supplier: f.str("supplier_id"), p_active: f.str("active") === "true" },
    translate(locale)("حُدّثت الحالة.", "Status updated."),
  );
}

export async function saveProductStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const category = f.str("category");
  const unit = f.str("pack_unit");
  const key = f.str("input_key");
  const size = f.num("pack_size");
  const price = f.num("price_usd");
  if (!(CATEGORIES as readonly string[]).includes(category)) return refused(t("اختر الصنف.", "Choose the category."));
  if (!(PACK_UNITS as readonly string[]).includes(unit)) return refused(t("اختر وحدة العبوة.", "Choose the pack unit."));
  if (!size || size <= 0) return refused(t("اكتب حجم العبوة.", "Enter the pack size."));
  if (!price || price <= 0) return refused(t("اكتب السعر بالدولار.", "Enter the price in dollars."));
  return step(
    supabase,
    locale,
    "supplier_product_save",
    {
      p_id: f.str("product_id") || null,
      p_category: category,
      p_input_key: (INPUT_KEYS as readonly string[]).includes(key) ? key : "",
      p_name: f.str("name"),
      p_active_ingredient: f.str("active_ingredient"),
      p_registration_no: f.str("registration_no"),
      p_cert_lot: f.str("cert_lot"),
      p_pack_size: size,
      p_pack_unit: unit,
      p_price_usd: price,
      p_valid_until: f.str("valid_until") || null,
    },
    t("حُفظ المنتج.", "Product saved."),
  );
}

export async function removeProductStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "supplier_product_remove",
    { p_id: f.str("product_id") },
    translate(locale)("أُوقف عرض المنتج.", "The product is no longer listed."),
  );
}

// ── الطلبات الجماعية ────────────────────────────────────────────────────────

/** Opens a group order; on success `id` is the new order's. */
export async function createGroupOrderStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const names = f.all("line_name");
  const labels = f.all("line_unit");
  const kgs = f.all("line_kg");
  const prices = f.all("line_price");
  const products = f.all("line_product");
  const lines = names
    .map((name, i) => ({
      product_id: products[i] || "",
      name: name.trim(),
      unit_label: (labels[i] ?? "").trim(),
      unit_kg: Number(kgs[i]),
      unit_price_usd: Number(prices[i]),
    }))
    .filter((l) => l.name && l.unit_label && l.unit_kg > 0 && l.unit_price_usd > 0);
  const phone = normalizePhone(f.str("organiser_phone"));
  if (!isState(f.str("pickup_state"))) return refused(t("اختر ولاية نقطة الاستلام.", "Choose the pickup point's state."));
  if (!phoneOk(phone)) return refused(t("اكتب رقم هاتفك صحيحاً.", "Enter your phone number correctly."));
  if (lines.length === 0) {
    return refused(t("أضف صنفاً واحداً على الأقلّ: اسمه ووحدته ووزنها وسعرها.", "Add at least one item: its name, unit, unit weight and price."));
  }
  const lat = f.num("pickup_lat");
  const lng = f.num("pickup_lng");
  const { data, error } = await supabase.rpc("group_order_create", {
    p_supplier: f.str("supplier_id"),
    p_title: f.str("title"),
    p_organiser_name: f.str("organiser_name"),
    p_organiser_phone: phone,
    p_pickup_name: f.str("pickup_name"),
    p_pickup_locality: f.str("pickup_locality"),
    p_pickup_state: f.str("pickup_state"),
    p_pickup_lat: lat !== null && lng !== null ? Number(lat.toFixed(5)) : null,
    p_pickup_lng: lat !== null && lng !== null ? Number(lng.toFixed(5)) : null,
    p_drop_day: f.str("drop_day") || null,
    p_deadline: f.str("deadline") || null,
    p_target_tonnes: f.num("target_tonnes"),
    p_deposit_pct: f.num("deposit_pct") ?? 10,
    p_payee: f.str("payee") === "supplier" ? "supplier" : "cooperative",
    p_payee_account: f.str("payee_account"),
    p_notes: f.str("notes"),
    p_lines: lines,
  });
  if (error || !data) return refused(explain(locale, error));
  return done(t("فُتح الطلب. أرسل رابطه لجيرانك ليتعهّدوا بكميّاتهم.", "The order is open. Send its link to your neighbours so they can pledge."), {
    id: String(data),
  });
}

export async function pledgeStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const qty = f.num("quantity");
  if (!qty || qty <= 0) return refused(t("اكتب الكميّة.", "Enter the quantity."));
  const phone = normalizePhone(f.str("phone"));
  return step(
    supabase,
    locale,
    "group_order_pledge",
    { p_line: f.str("line_id"), p_quantity: qty, p_display_name: f.str("display_name"), p_phone: phoneOk(phone) ? phone : "" },
    t(
      "سُجّل تعهّدك. ادفع المقدّم إلى الحساب المكتوب، ثمّ أعطِ المنظّم رقم التحويل.",
      "Your pledge is recorded. Pay the deposit to the account shown, then give the organiser the transfer reference.",
    ),
  );
}

export async function withdrawPledgeStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(supabase, locale, "group_order_withdraw", { p_pledge: f.str("pledge_id") }, translate(locale)("انسحبتَ من هذا الصنف.", "You have withdrawn from this item."));
}

export async function markDepositStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "group_order_mark_deposit",
    { p_pledge: f.str("pledge_id"), p_reference: f.str("reference") },
    translate(locale)("سُجّل استلام المقدّم.", "Deposit recorded as received."),
  );
}

export async function setPledgeStatusStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "group_order_set_pledge",
    { p_pledge: f.str("pledge_id"), p_status: f.str("status"), p_note: f.str("note") },
    translate(locale)("حُدّث التعهّد — ولم يتغيّر شيءٌ لغيره.", "Pledge updated — nobody else's changed."),
  );
}

export async function setOrderStatusStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "group_order_set_status",
    { p_order: f.str("order_id"), p_status: f.str("status") },
    translate(locale)("حُدّثت حالة الطلب.", "Order status updated."),
  );
}

// ── الناقلون والتوصيل ───────────────────────────────────────────────────────

export async function saveCarrierStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const phone = normalizePhone(f.str("phone"));
  const s = states(f, "states");
  if (!phoneOk(phone)) return refused(t("اكتب رقم هاتفٍ صحيحاً.", "Enter a valid phone number."));
  if (s.length === 0) return refused(t("اختر الولايات التي تعمل فيها.", "Choose the states you work in."));
  return step(
    supabase,
    locale,
    "carrier_save",
    { p_name: f.str("name"), p_phone: phone, p_vehicle: f.str("vehicle"), p_capacity: f.num("capacity_tonnes"), p_states: s },
    t(
      "حُفظت بياناتك ناقلاً. يراجعها المشرف قبل أن يُسند إليك توصيل.",
      "Your carrier details are saved. An administrator reviews them before any delivery is assigned to you.",
    ),
  );
}

export async function assignDeliveryStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const lat = f.num("dest_lat");
  const lng = f.num("dest_lng");
  return step(
    supabase,
    locale,
    "delivery_assign",
    {
      p_order: f.str("order_id"),
      p_pledge: f.str("pledge_id") || null,
      p_carrier: f.str("carrier_id"),
      p_destination: f.str("destination"),
      p_lat: lat !== null && lng !== null ? Number(lat.toFixed(5)) : null,
      p_lng: lat !== null && lng !== null ? Number(lng.toFixed(5)) : null,
      p_fee_usd: f.num("fee_usd"),
    },
    translate(locale)(
      "أُسند التوصيل. المستلم يُصدر رمزه من صفحة التوصيل ويعطيه للسائق عند الاستلام.",
      "Delivery assigned. The recipient issues their code on the deliveries page and gives it to the driver at handover.",
    ),
  );
}

/** The recipient's six-digit code; it is shown once and never stored in clear. On success `code` holds it. */
export async function issueDeliveryCodeStep(supabase: SupabaseClient, deliveryId: string, locale: Locale): Promise<StepResult> {
  const { data, error } = await supabase.rpc("delivery_issue_code", { p_delivery: deliveryId });
  if (error || typeof data !== "string") return refused(explain(locale, error));
  return done("", { code: data });
}

export async function confirmDeliveryStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const photo = f.str("photo_path");
  const lat = f.num("lat");
  const lng = f.num("lng");
  const code = latinDigits(f.str("code")).replace(/\D/g, "");
  if (!photo) return refused(t("صوّر البضاعة في مكان التسليم، وانتظر علامة ✓.", "Photograph the goods at the handover point and wait for the ✓."));
  if (lat === null || lng === null) return refused(t("اضغط «حدّد موقعي الآن» قبل التأكيد.", "Press “Use my location now” before confirming."));
  if (code.length !== 6) return refused(t("الرمز ستّة أرقام يعطيك إيّاها المستلم.", "The code is six digits the recipient gives you."));
  const { data, error } = await supabase.rpc("delivery_confirm", {
    p_delivery: f.str("delivery_id"),
    p_code: code,
    p_photo_path: photo,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: f.num("accuracy"),
  });
  if (error) return refused(explain(locale, error));
  if (data === "wrong_code") return refused(t("الرمز غير مطابق. اطلبه من المستلم مرّةً أخرى.", "The code does not match. Ask the recipient for it again."));
  if (data === "locked") {
    return refused(
      t(
        "أُقفل الرمز بعد خمس محاولاتٍ خاطئة. يُصدر المستلم رمزاً جديداً من صفحته.",
        "The code is locked after five wrong tries. The recipient issues a new one from their page.",
      ),
    );
  }
  return done(t("تأكّد التسليم بالرمز. صار التوصيل مستحقّ الدفع لك.", "Handover confirmed with the code. The delivery is now payable to you."));
}

export async function markDeliveryPaidStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(
    supabase,
    locale,
    "delivery_mark_paid",
    { p_delivery: f.str("delivery_id"), p_reference: f.str("reference") },
    translate(locale)("سُجّل الدفع للناقل.", "Carrier payment recorded."),
  );
}

export async function cancelDeliveryStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  return step(supabase, locale, "delivery_cancel", { p_delivery: f.str("delivery_id") }, translate(locale)("أُلغي التوصيل.", "Delivery cancelled."));
}
