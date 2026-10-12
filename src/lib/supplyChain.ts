/**
 * سلسلةُ المدخلات — ما تشترك فيه صفحات الموردين والطلبات الجماعية والتوصيل والتحقّق.
 *
 * The owner approved the spec on 12 October 2026 from docs/studies/suppliers-ar.md
 * (البند ١٠٤) and docs/studies/wallet-ar.md (the platform never holds money).
 * The tables and the functions that guard them are in
 * supabase/migrations/20261012130000_supply_chain.sql.
 *
 * NOT YET APPLIED. Until that migration reaches production, every query here
 * answers "relation does not exist" or "function not found". The pages treat
 * that one answer as «تُفعَّل قريباً» and still render how the thing works and
 * what a supplier needs — `isNotDeployed` is the single place that decides
 * which errors mean "not yet" rather than "broken".
 */

import type { Locale } from "./i18n";
import { SUDAN_STATES, SUDAN_STATES_EN } from "./nafir";

export const CATEGORIES = ["fertilizer", "seed", "pesticide", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, { ar: string; en: string }> = {
  fertilizer: { ar: "أسمدة", en: "Fertiliser" },
  seed: { ar: "بذور وتقاوي", en: "Seed" },
  pesticide: { ar: "مبيدات", en: "Pesticides" },
  other: { ar: "أخرى", en: "Other" },
};

/**
 * The input keys a product can carry, so the feasibility study's «من أين أشتري؟»
 * finds it. urea / DAP / TSP are the keys in inputPrices.ts and cropInputs.ts.
 */
export const INPUT_KEYS = ["urea", "DAP", "TSP", "NPK", "seed", "insecticide", "herbicide", "fungicide"] as const;
export type InputKey = (typeof INPUT_KEYS)[number];

export const INPUT_LABEL: Record<InputKey, { ar: string; en: string; category: Category }> = {
  urea: { ar: "يوريا", en: "Urea", category: "fertilizer" },
  DAP: { ar: "داب", en: "DAP", category: "fertilizer" },
  TSP: { ar: "سوبر فوسفات ثلاثي", en: "TSP", category: "fertilizer" },
  NPK: { ar: "سماد مركّب NPK", en: "NPK", category: "fertilizer" },
  seed: { ar: "تقاوي", en: "Seed", category: "seed" },
  insecticide: { ar: "مبيد حشري", en: "Insecticide", category: "pesticide" },
  herbicide: { ar: "مبيد حشائش", en: "Herbicide", category: "pesticide" },
  fungicide: { ar: "مبيد فطري", en: "Fungicide", category: "pesticide" },
};

export const PACK_UNITS = ["kg", "g", "l", "ml", "unit"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];
export const PACK_UNIT_LABEL: Record<PackUnit, { ar: string; en: string }> = {
  kg: { ar: "كجم", en: "kg" },
  g: { ar: "جم", en: "g" },
  l: { ar: "لتر", en: "L" },
  ml: { ar: "مل", en: "mL" },
  unit: { ar: "وحدة", en: "unit" },
};

export const lbl = (m: { ar: string; en: string }, locale: Locale) => (locale === "en" ? m.en : m.ar);

/** Sources the pages cite. */
export const SOURCES = {
  councilWarning: "https://almadarsdpress.net/?p=16561",
  pesticidesLaw: "https://leap.unep.org/en/countries/sd/national-legislation/law-1994-pesticides-and-pests-control-products",
  traderLicence: "https://ecosudan.net/?p=34589",
  fao2026: "https://openknowledge.fao.org/server/api/core/bitstreams/96c0924c-c465-4711-af3b-9c0da28ad24b/content",
};

// ── Rows as the pages read them ────────────────────────────────────────────

export interface Supplier {
  id: string;
  owner_id: string;
  name: string;
  state: string;
  locality: string;
  phone: string;
  whatsapp: string | null;
  delivery_states: string[];
  categories: Category[];
  pesticide_licence_no: string | null;
  seed_registration_no: string | null;
  commercial_registration_no: string | null;
  licence_doc_path: string | null;
  bio: string | null;
  verified_at: string | null;
  review_note: string | null;
  active: boolean;
  created_at: string;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  category: Category;
  input_key: InputKey | null;
  name: string;
  active_ingredient: string | null;
  registration_no: string | null;
  cert_lot: string | null;
  pack_size: number;
  pack_unit: PackUnit;
  price_usd: number;
  valid_until: string;
  active: boolean;
}

export interface GroupOrderSummary {
  id: string;
  title: string;
  supplier_id: string;
  supplier_name: string;
  pickup_name: string;
  pickup_locality: string;
  pickup_state: string;
  drop_day: string;
  deadline: string;
  target_tonnes: number;
  pledged_tonnes: number;
  members: number;
  deposit_pct: number;
  status: "open" | "closed" | "delivered" | "cancelled";
}

export interface GroupOrderDetail extends GroupOrderSummary {
  supplier_phone: string;
  organiser_name: string;
  organiser_phone: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  payee: "supplier" | "cooperative";
  payee_account: string | null;
  notes: string | null;
  my_role: "organiser" | "member" | null;
}

export interface GroupOrderLine {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  unit_label: string;
  unit_kg: number;
  unit_price_usd: number;
  position: number;
}

export interface Pledge {
  id: string;
  order_id: string;
  line_id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  quantity: number;
  status: "pledged" | "deposit_received" | "collected" | "withdrawn" | "defaulted";
  deposit_ref: string | null;
  deposit_marked_at: string | null;
  status_note: string | null;
}

export interface Carrier {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  vehicle: string;
  capacity_tonnes: number;
  states: string[];
  verified_at: string | null;
  review_note: string | null;
  active: boolean;
  created_at: string;
}

export interface Delivery {
  id: string;
  carrier_id: string;
  order_id: string;
  pledge_id: string | null;
  kind: "to_farm" | "to_pickup";
  recipient_id: string;
  assigned_by: string;
  destination: string;
  dest_lat: number | null;
  dest_lng: number | null;
  fee_usd: number | null;
  status: "assigned" | "confirmed" | "paid" | "cancelled";
  photo_path: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  confirmed_at: string | null;
  paid_at: string | null;
  paid_ref: string | null;
  created_at: string;
}

export interface ProductReport {
  id: string;
  reporter_id: string | null;
  product_name: string;
  registration_no: string | null;
  where_bought: string;
  state: string;
  photo_path: string | null;
  details: string | null;
  status: "new" | "forwarded" | "dismissed";
  admin_note: string | null;
  created_at: string;
}

export const PLEDGE_STATUS: Record<Pledge["status"], { ar: string; en: string }> = {
  pledged: { ar: "متعهّد — بانتظار المقدّم", en: "Pledged — awaiting deposit" },
  deposit_received: { ar: "استُلم المقدّم", en: "Deposit received" },
  collected: { ar: "استلم بضاعته", en: "Collected" },
  withdrawn: { ar: "انسحب", en: "Withdrawn" },
  defaulted: { ar: "متعثّر — خارج الحمولة", en: "Defaulted — out of the load" },
};

export const ORDER_STATUS: Record<GroupOrderSummary["status"], { ar: string; en: string }> = {
  open: { ar: "مفتوح للانضمام", en: "Open to join" },
  closed: { ar: "أُغلق الانضمام", en: "Joining closed" },
  delivered: { ar: "سُلّم", en: "Delivered" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

export const DELIVERY_STATUS: Record<Delivery["status"], { ar: string; en: string }> = {
  assigned: { ar: "بانتظار التسليم", en: "Awaiting handover" },
  confirmed: { ar: "سُلّم بالرمز — مستحقّ الدفع للناقل", en: "Delivered with the code — carrier payable" },
  paid: { ar: "دُفع للناقل", en: "Carrier paid" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

// ── "Not deployed yet" ─────────────────────────────────────────────────────

/**
 * True when an error means the migration has not reached this database:
 * Postgres' undefined table / function, or PostgREST's "not in the schema
 * cache" for either. Any other error is a real failure and is not hidden.
 */
export function isNotDeployed(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42883", "PGRST202", "PGRST205", "PGRST200"].includes(code)) return true;
  const m = error.message ?? "";
  return /does not exist|schema cache|Could not find the (table|function)/i.test(m);
}

// ── Money ──────────────────────────────────────────────────────────────────

export const usd = (n: number, locale: Locale) =>
  `$${Number(n).toLocaleString(locale === "en" ? "en-US" : "ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const sdg = (n: number, locale: Locale) =>
  locale === "en"
    ? `SDG ${Math.round(n).toLocaleString("en-US")}`
    : `${Math.round(n).toLocaleString("ar")} جنيه`;

export const num = (n: number, locale: Locale, digits = 1) =>
  Number(n).toLocaleString(locale === "en" ? "en-GB" : "ar", { maximumFractionDigits: digits });

export const dateLabel = (iso: string, locale: Locale) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export const today = () => new Date().toISOString().slice(0, 10);

/** The date n days from today, as YYYY-MM-DD (UTC). */
export const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ── Input from forms and links ─────────────────────────────────────────────

/** Arabic or Persian digits to Latin, everything but digits and a leading + removed. */
export function normalizePhone(raw: string): string {
  const latin = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
  const plus = latin.trim().startsWith("+");
  const digits = latin.replace(/\D/g, "");
  return (plus ? "+" : "") + digits;
}

/** A wa.me link: Sudanese local numbers (0912…) become 249912…. */
export function whatsappLink(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `249${d.slice(1)}`;
  return `https://wa.me/${d}`;
}

/**
 * The state in a link, as stored (Arabic). The feasibility study links with the
 * Arabic name; an English name or a lower-case one is accepted too, so a link
 * typed by hand still filters.
 */
export function resolveState(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if ((SUDAN_STATES as readonly string[]).includes(s)) return s;
  const hit = Object.entries(SUDAN_STATES_EN).find(([, en]) => en.toLowerCase() === s.toLowerCase());
  return hit ? hit[0] : null;
}

/** ?item= — an input key (urea, DAP…) or a category (fertilizer, seed, pesticide). */
export function resolveItem(raw: string | undefined): { key: InputKey | null; category: Category | null } {
  if (!raw) return { key: null, category: null };
  const s = raw.trim();
  const key = INPUT_KEYS.find((k) => k.toLowerCase() === s.toLowerCase()) ?? null;
  if (key) return { key, category: null };
  const category = CATEGORIES.find((c) => c === s.toLowerCase()) ?? null;
  return { key: null, category };
}

export function matchesItem(p: SupplierProduct, item: { key: InputKey | null; category: Category | null }): boolean {
  if (item.key) return p.input_key === item.key || (item.key === "seed" && p.category === "seed");
  if (item.category) return p.category === item.category;
  return true;
}
