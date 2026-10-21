import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tr, type Locale } from "./i18n";

/**
 * «أين السماد والجازولين هذا الأسبوع وبكم» (البند ١٢٠). Not to be confused with
 * inputPrices.ts, the dollar prices the feasibility study runs on.
 *
 * Three layers, each saying where it comes from:
 *
 *   1. What farmers and traders report this week — the only weekly source,
 *      read through input_price_summary / input_price_reports_recent, which
 *      never return who reported (supabase/migrations/20261021190000_*).
 *   2. Verified suppliers on Sudagri who list urea or DAP — the suppliers page.
 *   3. The latest published figures and trends, copied by hand with their
 *      source and date into content/market/inputs.json, the way wfp.json is.
 *
 * Why no feed: FEWS NET has no fertiliser series for Sudan, and its diesel
 * series carry no value since 2024; WFP's and IFPRI's monthly reports give
 * the direction a month late, in charts. Every number shown is a number read
 * somewhere — a report, a supplier's listing or a cited source.
 */

export const INPUT_ITEMS = ["urea", "dap", "npk", "diesel", "petrol"] as const;
export type InputItem = (typeof INPUT_ITEMS)[number];

export const INPUT_UNITS = ["sack_50kg", "kg", "liter", "gallon", "barrel"] as const;
export type InputUnit = (typeof INPUT_UNITS)[number];

export type PriceKind = "official" | "parallel";
export type Availability = "available" | "limited" | "unavailable";

export const ITEM_LABEL: Record<InputItem, { ar: string; en: string }> = {
  urea: { ar: "يوريا", en: "Urea" },
  dap: { ar: "داب", en: "DAP" },
  npk: { ar: "سماد مركّب NPK", en: "NPK" },
  diesel: { ar: "جازولين", en: "Diesel" },
  petrol: { ar: "بنزين", en: "Petrol" },
};

export const UNIT_LABEL: Record<InputUnit, { ar: string; en: string }> = {
  sack_50kg: { ar: "جوال ٥٠ كجم", en: "50 kg sack" },
  kg: { ar: "كيلو", en: "kg" },
  liter: { ar: "لتر", en: "litre" },
  gallon: { ar: "جالون", en: "gallon" },
  barrel: { ar: "برميل", en: "barrel" },
};

export const KIND_LABEL: Record<PriceKind, { ar: string; en: string }> = {
  official: { ar: "السعر الرسميّ", en: "Official price" },
  parallel: { ar: "السوق الموازي", en: "Parallel market" },
};

export const AVAILABILITY_LABEL: Record<Availability, { ar: string; en: string }> = {
  available: { ar: "موجود", en: "Available" },
  limited: { ar: "قليل", en: "Scarce" },
  unavailable: { ar: "غير موجود", en: "Not to be found" },
};

export const isFuel = (item: InputItem) => item === "diesel" || item === "petrol";

/** The units a report of this item may use — the same pairing the database checks. */
export const unitsFor = (item: InputItem): InputUnit[] =>
  isFuel(item) ? ["liter", "gallon", "barrel"] : ["sack_50kg", "kg"];

/** Days back a report may be dated, as the database enforces. */
export const REPORT_MAX_AGE_DAYS = 14;

export const label = <K extends string>(map: Record<K, { ar: string; en: string }>, k: K, locale: Locale) =>
  locale === "en" ? map[k].en : map[k].ar;

export interface ReportInput {
  item: string;
  unit: string;
  priceKind: string;
  availability: string;
  price: number | null;
  observedOn: string;
}

/**
 * The checks the database makes, in a sentence the reader understands, before
 * the form reaches it. Null when the report is well-formed. `today` is
 * Khartoum's date (YYYY-MM-DD).
 */
export function reportProblem(r: ReportInput, today: string, locale: Locale): string | null {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  if (!(INPUT_ITEMS as readonly string[]).includes(r.item)) return t("اختر الصنف.", "Choose the item.");
  const item = r.item as InputItem;
  if (!unitsFor(item).includes(r.unit as InputUnit))
    return isFuel(item) ? t("الوقود باللتر أو الجالون أو البرميل.", "Fuel is per litre, gallon or barrel.") : t("السماد بالجوال أو الكيلو.", "Fertiliser is per sack or kg.");
  if (isFuel(item) && r.priceKind !== "official" && r.priceKind !== "parallel")
    return t("اختر: السعر الرسميّ أم السوق الموازي.", "Choose: official price or parallel market.");
  if (!["available", "limited", "unavailable"].includes(r.availability)) return t("اختر: موجود أم قليل أم غير موجود.", "Choose: available, scarce or not to be found.");
  if (r.availability !== "unavailable" && (r.price === null || !Number.isFinite(r.price) || r.price <= 0 || r.price > 100_000_000))
    return t("اكتب السعر بالجنيه، أو اختر «غير موجود».", "Enter the price in pounds, or choose «not to be found».");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.observedOn)) return t("اختر اليوم.", "Choose the day.");
  const age = daysBetween(r.observedOn, today);
  if (age < 0) return t("لا يكون التاريخ في المستقبل.", "The date cannot be in the future.");
  if (age > REPORT_MAX_AGE_DAYS) return t("البلاغ عن آخر أربعة عشر يوماً فقط.", "Reports cover the last fourteen days only.");
  return null;
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Khartoum's date today, YYYY-MM-DD: the database judges a report's day by it. */
export const khartoumToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

// ═══════════════════════════════════════════════════════════════════════════
// The summary row, as input_price_summary returns it
// ═══════════════════════════════════════════════════════════════════════════

export interface SummaryRow {
  item: InputItem;
  unit: InputUnit;
  price_kind: "" | PriceKind;
  state: string;
  reports: number;
  reporters: number;
  priced: number;
  low: number | null;
  high: number | null;
  median: number | null;
  latest_on: string;
  unavailable: number;
  limited: number;
}

/**
 * What the line says about availability: «غير موجود» wins when most reports
 * say so, then «قليل», else «موجود». A count, not a judgement.
 */
export function availabilityVerdict(r: Pick<SummaryRow, "reports" | "unavailable" | "limited">): Availability {
  if (r.unavailable * 2 > r.reports) return "unavailable";
  if ((r.unavailable + r.limited) * 2 > r.reports) return "limited";
  return "available";
}

/** Rows grouped by item, in the order a farmer asks: fertiliser first, then fuel. */
export function groupByItem(rows: SummaryRow[]): [InputItem, SummaryRow[]][] {
  const out: [InputItem, SummaryRow[]][] = [];
  for (const item of INPUT_ITEMS) {
    const these = rows.filter((r) => r.item === item);
    if (these.length) out.push([item, these]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Published figures — content/market/inputs.json, copied by hand
// ═══════════════════════════════════════════════════════════════════════════

export interface PublishedFigure {
  item: InputItem;
  place_ar: string;
  place_en: string;
  price: number;
  /** As the source states it: a sack whose size is not stated stays «sack». */
  unit: "sack" | InputUnit;
  date: string;
  note_ar?: string;
  note_en?: string;
  source_ar: string;
  source_en: string;
  url: string;
}

export interface PublishedTrend {
  month: string;
  source_ar: string;
  source_en: string;
  url: string;
  ar: string;
  en: string;
}

export interface PublishedInputs {
  checked: string;
  figures: PublishedFigure[];
  trends: PublishedTrend[];
}

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUrl = (s: unknown) => typeof s === "string" && /^https?:\/\//.test(s);
const isText = (s: unknown) => typeof s === "string" && s.trim().length > 1;

/** Validates as it reads: a hand-edited line with one field wrong is dropped, not shown wrong. Exported for tests. */
export function parsePublishedInputs(raw: unknown): PublishedInputs | null {
  const r = raw as Partial<PublishedInputs> | null;
  if (!r || typeof r !== "object" || !isDate(r.checked)) return null;
  const figures = (Array.isArray(r.figures) ? r.figures : []).filter(
    (f): f is PublishedFigure =>
      !!f &&
      (INPUT_ITEMS as readonly string[]).includes(f.item) &&
      (f.unit === "sack" || (INPUT_UNITS as readonly string[]).includes(f.unit)) &&
      typeof f.price === "number" && Number.isFinite(f.price) && f.price > 0 &&
      isDate(f.date) && isUrl(f.url) && isText(f.place_ar) && isText(f.place_en) && isText(f.source_ar) && isText(f.source_en) &&
      (f.note_ar === undefined || isText(f.note_ar)) && (f.note_en === undefined || isText(f.note_en)),
  );
  const trends = (Array.isArray(r.trends) ? r.trends : []).filter(
    (t): t is PublishedTrend =>
      !!t && typeof t.month === "string" && /^\d{4}-\d{2}$/.test(t.month) && isUrl(t.url) &&
      isText(t.ar) && isText(t.en) && isText(t.source_ar) && isText(t.source_en),
  );
  return { checked: r.checked!, figures, trends };
}

export function readPublishedInputs(): PublishedInputs | null {
  try {
    return parsePublishedInputs(JSON.parse(readFileSync(join(process.cwd(), "content/market/inputs.json"), "utf8")));
  } catch (e) {
    console.error("inputs: published file unreadable", e);
    return null;
  }
}

/** «للجوال», «للّتر»… — written out, because «لل» + «لتر» is not Arabic. */
const PER_UNIT: Record<PublishedFigure["unit"], { ar: string; en: string }> = {
  sack: { ar: "للجوال", en: "per sack" },
  sack_50kg: { ar: "للجوال (٥٠ كجم)", en: "per 50 kg sack" },
  kg: { ar: "للكيلو", en: "per kg" },
  liter: { ar: "للّتر", en: "per litre" },
  gallon: { ar: "للجالون", en: "per gallon" },
  barrel: { ar: "للبرميل", en: "per barrel" },
};

export const perUnit = (u: PublishedFigure["unit"], locale: Locale) => label(PER_UNIT, u, locale);
