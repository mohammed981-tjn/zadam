"use server";

import { SUDAN_STATES } from "@/lib/nafir";
import { CATEGORIES, INPUT_KEYS, PACK_UNITS, normalizePhone } from "@/lib/supplyChain";
import { back, explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * Every supply step is a database function (supabase/migrations/
 * 20261012130000_supply_chain.sql) that checks who is taking it. These actions
 * carry the form there; the database is the boundary, and the checks here only
 * turn an obviously incomplete form into a sentence before the round trip.
 */

const isState = (s: string) => (SUDAN_STATES as readonly string[]).includes(s);
const states = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(isState);
const phoneOk = (p: string) => /^\+?[0-9]{7,15}$/.test(p);

// ── المورد ──────────────────────────────────────────────────────────────────

export async function saveSupplier(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/mine";
  const phone = normalizePhone(str(fd, "phone"));
  const whatsapp = normalizePhone(str(fd, "whatsapp"));
  const categories = fd.getAll("categories").map(String).filter((c) => (CATEGORIES as readonly string[]).includes(c));
  if (!isState(str(fd, "state"))) back(path, "error", t("اختر الولاية.", "Choose the state."));
  if (!phoneOk(phone)) back(path, "error", t("اكتب رقم هاتفٍ صحيحاً.", "Enter a valid phone number."));
  if (whatsapp && !phoneOk(whatsapp)) back(path, "error", t("رقم واتساب غير صحيح.", "The WhatsApp number is not valid."));
  if (categories.length === 0) back(path, "error", t("اختر ما تبيعه.", "Choose what you sell."));
  const { error } = await supabase.rpc("supplier_save", {
    p_name: str(fd, "name"),
    p_state: str(fd, "state"),
    p_locality: str(fd, "locality"),
    p_phone: phone,
    p_whatsapp: whatsapp,
    p_delivery_states: states(fd, "delivery_states"),
    p_categories: categories,
    p_pesticide_licence: str(fd, "pesticide_licence_no"),
    p_seed_registration: str(fd, "seed_registration_no"),
    p_commercial_registration: str(fd, "commercial_registration_no"),
    p_bio: str(fd, "bio"),
  });
  if (error) back(path, "error", explain(locale, error));
  back(path, "ok", t("حُفظت بيانات المورد. ارفع صورة المستندات ليراجعها المشرف.", "Supplier details saved. Upload a photo of the documents for review."));
}

export async function setSupplierDocument(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/mine";
  const doc = str(fd, "doc_path");
  if (!doc) back(path, "error", t("ارفع صورة المستندات أولاً، وانتظر علامة ✓.", "Upload the document photo first and wait for the ✓."));
  const { error } = await supabase.rpc("supplier_set_document", { p_path: doc });
  if (error) back(path, "error", explain(locale, error));
  back(path, "ok", t("وصلت المستندات. يراجعها المشرف ثمّ تظهر شارة «موثّق».", "Documents received. An administrator will review them, then the “Verified” badge appears."));
}

export async function setSupplierActive(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("supplier_set_active", {
    p_supplier: str(fd, "supplier_id"),
    p_active: str(fd, "active") === "true",
  });
  if (error) back("/suppliers/mine", "error", explain(locale, error));
  back("/suppliers/mine", "ok", t("حُدّثت الحالة.", "Status updated."));
}

export async function saveProduct(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/mine";
  const category = str(fd, "category");
  const unit = str(fd, "pack_unit");
  const key = str(fd, "input_key");
  const size = numOrNull(fd, "pack_size");
  const price = numOrNull(fd, "price_usd");
  if (!(CATEGORIES as readonly string[]).includes(category)) back(path, "error", t("اختر الصنف.", "Choose the category."));
  if (!(PACK_UNITS as readonly string[]).includes(unit)) back(path, "error", t("اختر وحدة العبوة.", "Choose the pack unit."));
  if (!size || size <= 0) back(path, "error", t("اكتب حجم العبوة.", "Enter the pack size."));
  if (!price || price <= 0) back(path, "error", t("اكتب السعر بالدولار.", "Enter the price in dollars."));
  const { error } = await supabase.rpc("supplier_product_save", {
    p_id: str(fd, "product_id") || null,
    p_category: category,
    p_input_key: (INPUT_KEYS as readonly string[]).includes(key) ? key : "",
    p_name: str(fd, "name"),
    p_active_ingredient: str(fd, "active_ingredient"),
    p_registration_no: str(fd, "registration_no"),
    p_cert_lot: str(fd, "cert_lot"),
    p_pack_size: size,
    p_pack_unit: unit,
    p_price_usd: price,
    p_valid_until: str(fd, "valid_until") || null,
  });
  if (error) back(path, "error", explain(locale, error));
  back(path, "ok", t("حُفظ المنتج.", "Product saved."));
}

export async function removeProduct(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("supplier_product_remove", { p_id: str(fd, "product_id") });
  if (error) back("/suppliers/mine", "error", explain(locale, error));
  back("/suppliers/mine", "ok", t("أُوقف عرض المنتج.", "The product is no longer listed."));
}

// ── الطلبات الجماعية ────────────────────────────────────────────────────────

export async function createGroupOrder(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/orders";
  const names = fd.getAll("line_name").map(String);
  const labels = fd.getAll("line_unit").map(String);
  const kgs = fd.getAll("line_kg").map(String);
  const prices = fd.getAll("line_price").map(String);
  const products = fd.getAll("line_product").map(String);
  const lines = names
    .map((name, i) => ({
      product_id: products[i] || "",
      name: name.trim(),
      unit_label: (labels[i] ?? "").trim(),
      unit_kg: Number(kgs[i]),
      unit_price_usd: Number(prices[i]),
    }))
    .filter((l) => l.name && l.unit_label && l.unit_kg > 0 && l.unit_price_usd > 0);
  const phone = normalizePhone(str(fd, "organiser_phone"));
  if (!isState(str(fd, "pickup_state"))) back(path, "error", t("اختر ولاية نقطة الاستلام.", "Choose the pickup point's state."));
  if (!phoneOk(phone)) back(path, "error", t("اكتب رقم هاتفك صحيحاً.", "Enter your phone number correctly."));
  if (lines.length === 0) back(path, "error", t("أضف صنفاً واحداً على الأقلّ: اسمه ووحدته ووزنها وسعرها.", "Add at least one item: its name, unit, unit weight and price."));
  const lat = numOrNull(fd, "pickup_lat");
  const lng = numOrNull(fd, "pickup_lng");
  const { data, error } = await supabase.rpc("group_order_create", {
    p_supplier: str(fd, "supplier_id"),
    p_title: str(fd, "title"),
    p_organiser_name: str(fd, "organiser_name"),
    p_organiser_phone: phone,
    p_pickup_name: str(fd, "pickup_name"),
    p_pickup_locality: str(fd, "pickup_locality"),
    p_pickup_state: str(fd, "pickup_state"),
    p_pickup_lat: lat !== null && lng !== null ? Number(lat.toFixed(5)) : null,
    p_pickup_lng: lat !== null && lng !== null ? Number(lng.toFixed(5)) : null,
    p_drop_day: str(fd, "drop_day") || null,
    p_deadline: str(fd, "deadline") || null,
    p_target_tonnes: numOrNull(fd, "target_tonnes"),
    p_deposit_pct: numOrNull(fd, "deposit_pct") ?? 10,
    p_payee: str(fd, "payee") === "supplier" ? "supplier" : "cooperative",
    p_payee_account: str(fd, "payee_account"),
    p_notes: str(fd, "notes"),
    p_lines: lines,
  });
  if (error || !data) back(path, "error", explain(locale, error));
  back(`/suppliers/orders/${data}`, "ok", t("فُتح الطلب. أرسل رابطه لجيرانك ليتعهّدوا بكميّاتهم.", "The order is open. Send its link to your neighbours so they can pledge."));
}

async function orderStep(fd: FormData, fn: string, args: Record<string, unknown>, ok: [string, string]) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = `/suppliers/orders/${str(fd, "order_id")}`;
  const { error } = await supabase.rpc(fn, args);
  if (error) back(path, "error", explain(locale, error));
  back(path, "ok", t(...ok));
}

export async function pledge(fd: FormData) {
  const qty = numOrNull(fd, "quantity");
  const { t } = await translator();
  if (!qty || qty <= 0) back(`/suppliers/orders/${str(fd, "order_id")}`, "error", t("اكتب الكميّة.", "Enter the quantity."));
  const phone = normalizePhone(str(fd, "phone"));
  await orderStep(
    fd,
    "group_order_pledge",
    { p_line: str(fd, "line_id"), p_quantity: qty, p_display_name: str(fd, "display_name"), p_phone: phoneOk(phone) ? phone : "" },
    ["سُجّل تعهّدك. ادفع المقدّم إلى الحساب المكتوب، ثمّ أعطِ المنظّم رقم التحويل.", "Your pledge is recorded. Pay the deposit to the account shown, then give the organiser the transfer reference."],
  );
}

export async function withdrawPledge(fd: FormData) {
  await orderStep(fd, "group_order_withdraw", { p_pledge: str(fd, "pledge_id") }, ["انسحبتَ من هذا الصنف.", "You have withdrawn from this item."]);
}

export async function markDeposit(fd: FormData) {
  await orderStep(
    fd,
    "group_order_mark_deposit",
    { p_pledge: str(fd, "pledge_id"), p_reference: str(fd, "reference") },
    ["سُجّل استلام المقدّم.", "Deposit recorded as received."],
  );
}

export async function setPledgeStatus(fd: FormData) {
  await orderStep(
    fd,
    "group_order_set_pledge",
    { p_pledge: str(fd, "pledge_id"), p_status: str(fd, "status"), p_note: str(fd, "note") },
    ["حُدّث التعهّد — ولم يتغيّر شيءٌ لغيره.", "Pledge updated — nobody else's changed."],
  );
}

export async function setOrderStatus(fd: FormData) {
  await orderStep(
    fd,
    "group_order_set_status",
    { p_order: str(fd, "order_id"), p_status: str(fd, "status") },
    ["حُدّثت حالة الطلب.", "Order status updated."],
  );
}

// ── الناقلون والتوصيل ───────────────────────────────────────────────────────

export async function saveCarrier(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/deliveries";
  const phone = normalizePhone(str(fd, "phone"));
  const s = states(fd, "states");
  if (!phoneOk(phone)) back(path, "error", t("اكتب رقم هاتفٍ صحيحاً.", "Enter a valid phone number."));
  if (s.length === 0) back(path, "error", t("اختر الولايات التي تعمل فيها.", "Choose the states you work in."));
  const { error } = await supabase.rpc("carrier_save", {
    p_name: str(fd, "name"),
    p_phone: phone,
    p_vehicle: str(fd, "vehicle"),
    p_capacity: numOrNull(fd, "capacity_tonnes"),
    p_states: s,
  });
  if (error) back(path, "error", explain(locale, error));
  back(path, "ok", t("حُفظت بياناتك ناقلاً. يراجعها المشرف قبل أن يُسند إليك توصيل.", "Your carrier details are saved. An administrator reviews them before any delivery is assigned to you."));
}

export async function assignDelivery(fd: FormData) {
  const lat = numOrNull(fd, "dest_lat");
  const lng = numOrNull(fd, "dest_lng");
  await orderStep(
    fd,
    "delivery_assign",
    {
      p_order: str(fd, "order_id"),
      p_pledge: str(fd, "pledge_id") || null,
      p_carrier: str(fd, "carrier_id"),
      p_destination: str(fd, "destination"),
      p_lat: lat !== null && lng !== null ? Number(lat.toFixed(5)) : null,
      p_lng: lat !== null && lng !== null ? Number(lng.toFixed(5)) : null,
      p_fee_usd: numOrNull(fd, "fee_usd"),
    },
    ["أُسند التوصيل. المستلم يُصدر رمزه من صفحة التوصيل ويعطيه للسائق عند الاستلام.", "Delivery assigned. The recipient issues their code on the deliveries page and gives it to the driver at handover."],
  );
}

/** Called from the recipient's button; the code is shown once and never stored in clear. */
export async function issueDeliveryCode(deliveryId: string): Promise<{ code?: string; error?: string }> {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const { data, error } = await supabase.rpc("delivery_issue_code", { p_delivery: deliveryId });
  if (error || typeof data !== "string") return { error: explain(locale, error) };
  return { code: data };
}

export async function confirmDelivery(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/suppliers/deliveries";
  const photo = str(fd, "photo_path");
  const lat = numOrNull(fd, "lat");
  const lng = numOrNull(fd, "lng");
  const code = str(fd, "code").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
  if (!photo) back(path, "error", t("صوّر البضاعة في مكان التسليم، وانتظر علامة ✓.", "Photograph the goods at the handover point and wait for the ✓."));
  if (lat === null || lng === null) back(path, "error", t("اضغط «حدّد موقعي الآن» قبل التأكيد.", "Press “Use my location now” before confirming."));
  if (code.length !== 6) back(path, "error", t("الرمز ستّة أرقام يعطيك إيّاها المستلم.", "The code is six digits the recipient gives you."));
  const { data, error } = await supabase.rpc("delivery_confirm", {
    p_delivery: str(fd, "delivery_id"),
    p_code: code,
    p_photo_path: photo,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: numOrNull(fd, "accuracy"),
  });
  if (error) back(path, "error", explain(locale, error));
  if (data === "wrong_code") back(path, "error", t("الرمز غير مطابق. اطلبه من المستلم مرّةً أخرى.", "The code does not match. Ask the recipient for it again."));
  if (data === "locked")
    back(path, "error", t("أُقفل الرمز بعد خمس محاولاتٍ خاطئة. يُصدر المستلم رمزاً جديداً من صفحته.", "The code is locked after five wrong tries. The recipient issues a new one from their page."));
  back(path, "ok", t("تأكّد التسليم بالرمز. صار التوصيل مستحقّ الدفع لك.", "Handover confirmed with the code. The delivery is now payable to you."));
}

export async function markDeliveryPaid(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("delivery_mark_paid", { p_delivery: str(fd, "delivery_id"), p_reference: str(fd, "reference") });
  if (error) back("/suppliers/deliveries", "error", explain(locale, error));
  back("/suppliers/deliveries", "ok", t("سُجّل الدفع للناقل.", "Carrier payment recorded."));
}

export async function cancelDelivery(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("delivery_cancel", { p_delivery: str(fd, "delivery_id") });
  if (error) back("/suppliers/deliveries", "error", explain(locale, error));
  back("/suppliers/deliveries", "ok", t("أُلغي التوصيل.", "Delivery cancelled."));
}
