import { tr, type Locale } from "@/lib/i18n";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import { CROPS } from "@/lib/agronomy";
import { WRB } from "@/lib/soilClasses";

/**
 * الشركاتُ الشريكة واتّفاقاتُها المبدئيّة وفهرسُ المزارع (البند ١١١).
 *
 * The database is the boundary (supabase/migrations/20261017120000_partner_
 * companies.sql): every list here mirrors a CHECK constraint there, so a form
 * built from it cannot offer what the table would refuse.
 */

export type Bi = { ar: string; en: string };
export const lbl = (b: Bi, locale: Locale) => tr(locale, b.ar, b.en);

// ── أنواع الشركات ─────────────────────────────────────────────────────────

export const PARTNER_KINDS = [
  "mechanization",
  "irrigation",
  "inputs",
  "harvest",
  "packing",
  "transport",
  "extension",
  "supervision",
] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const PARTNER_KIND_LABEL: Record<PartnerKind, Bi> = {
  mechanization: { ar: "ميكنة وتجهيز الأرض", en: "Machinery and land preparation" },
  irrigation: { ar: "ريّ", en: "Irrigation" },
  inputs: { ar: "مدخلات: بذور وسماد ومبيدات", en: "Inputs: seed, fertiliser, pesticides" },
  harvest: { ar: "حصاد ودراس", en: "Harvest and threshing" },
  packing: { ar: "تعبئة وتغليف", en: "Packing" },
  transport: { ar: "نقل وتخزين", en: "Transport and storage" },
  extension: { ar: "إرشاد زراعي", en: "Extension" },
  supervision: { ar: "إشراف ومتابعة", en: "Supervision and follow-up" },
};

// ── فئات المساحة ──────────────────────────────────────────────────────────

/**
 * Four bands, by the owner's decision of 20 October 2026 (backlog 115):
 * under 20 feddans is the Gezira's standard tenancy, and 1,000 the unit the
 * mechanised rainfed schemes were demarcated in. land_area_band() in
 * supabase/migrations/20261020120000_four_area_bands.sql holds the same three
 * numbers — change both together.
 */
export const AREA_BAND_LIMITS = { small: 20, medium: 200, large: 1000 } as const;

export const AREA_BANDS = ["small", "medium", "large", "scheme"] as const;
export type AreaBand = (typeof AREA_BANDS)[number];

export function areaBand(feddans: number | string | null | undefined): AreaBand | null {
  if (feddans == null || feddans === "") return null;
  const f = Number(feddans);
  if (!Number.isFinite(f)) return null;
  if (f < AREA_BAND_LIMITS.small) return "small";
  if (f < AREA_BAND_LIMITS.medium) return "medium";
  if (f < AREA_BAND_LIMITS.large) return "large";
  return "scheme";
}

export const AREA_BAND_LABEL: Record<AreaBand, Bi> = {
  small: { ar: `صغيرة (أقلّ من ${AREA_BAND_LIMITS.small} فداناً)`, en: `Small (under ${AREA_BAND_LIMITS.small} feddans)` },
  medium: {
    ar: `متوسّطة (${AREA_BAND_LIMITS.small} إلى أقلّ من ${AREA_BAND_LIMITS.medium})`,
    en: `Medium (${AREA_BAND_LIMITS.small} to under ${AREA_BAND_LIMITS.medium})`,
  },
  large: {
    ar: `كبيرة (${AREA_BAND_LIMITS.medium} إلى أقلّ من ${AREA_BAND_LIMITS.large})`,
    en: `Large (${AREA_BAND_LIMITS.medium} to under ${AREA_BAND_LIMITS.large})`,
  },
  scheme: { ar: `مشروعٌ آليّ (${AREA_BAND_LIMITS.large} فدان فأكثر)`, en: `Mechanised scheme (${AREA_BAND_LIMITS.large} feddans or more)` },
};

export const AREA_BAND_SHORT: Record<AreaBand, Bi> = {
  small: { ar: "صغيرة", en: "Small" },
  medium: { ar: "متوسّطة", en: "Medium" },
  large: { ar: "كبيرة", en: "Large" },
  scheme: { ar: "مشروع آليّ", en: "Mechanised scheme" },
};

/**
 * The area as a party may see it: in feddans once they may (the owner, or an investor the owner has accepted), its
 * band before that (money-logic-4, the owner's question 18).
 */
export function areaShown(feddans: number | null, band: string | null, locale: Locale): string {
  if (feddans !== null && feddans !== undefined) return `${Number(feddans).toLocaleString("en-US")} ${tr(locale, "فدان", "feddans")}`;
  const b = (AREA_BANDS as readonly string[]).includes(band ?? "") ? (band as AreaBand) : null;
  return b ? lbl(AREA_BAND_LABEL[b], locale) : tr(locale, "المساحة بعد القبول", "Area after acceptance");
}

// ── الماء والتربة والمحاصيل ───────────────────────────────────────────────

export const WATER_SOURCES = Object.keys(WATER_SOURCE_LABEL) as WaterSource[];

/** The WRB groups the soil map names, in the table's spelling. */
export const SOIL_CLASS_KEYS = Object.keys(WRB);

/** The field crops the water engine knows — the same keys the season plans use. */
export const PARTNER_CROP_KEYS = CROPS.map((c) => c.key);

// ── الحالات ───────────────────────────────────────────────────────────────

export const AGREEMENT_STATUS: Record<PartnerAgreement["status"], Bi> = {
  draft: { ar: "مسوّدة — بانتظار المشرف", en: "Draft — awaiting an administrator" },
  active: { ar: "مفعَّل", en: "Active" },
  ended: { ar: "منتهٍ", en: "Ended" },
};

export const INTEREST_STATUS: Record<PartnerInterest["status"], Bi> = {
  pending: { ar: "بانتظار ردّ صاحب الأرض", en: "Awaiting the landowner" },
  accepted: { ar: "قَبِل صاحبُ الأرض", en: "Accepted by the landowner" },
  declined: { ar: "اعتذر صاحبُ الأرض", en: "Declined by the landowner" },
  withdrawn: { ar: "سُحب الطلب", en: "Withdrawn" },
};

// ── الصفوف ────────────────────────────────────────────────────────────────

export interface PartnerCompany {
  id: string;
  owner_id: string;
  name: string;
  commercial_registration_no: string | null;
  kinds: PartnerKind[];
  states: string[];
  contact_name: string;
  phone: string;
  whatsapp: string | null;
  bio: string | null;
  verified_at: string | null;
  review_note: string | null;
  active: boolean;
  created_at: string;
}

export interface PartnerAgreement {
  id: string;
  company_id: string;
  title: string;
  states: string[];
  water_sources: string[];
  soil_classes: string[];
  area_bands: string[];
  crop_keys: string[];
  services: string[];
  terms: string;
  valid_from: string;
  valid_until: string;
  status: "draft" | "active" | "ended";
  created_at: string;
}

export interface PartnerInterest {
  id: string;
  company_id: string;
  land_id: string;
  agreement_id: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  created_at: string;
  decided_at: string | null;
}

/** A row of partner_matching_lands(): the group, never the owner or the place. */
export interface MatchingLand {
  land_id: string;
  state: string;
  locality: string | null;
  feddans: number;
  area_band: AreaBand | null;
  soil_class: string | null;
  water_source: string;
  crop_keys: string[];
  station_key: string;
  agreement_id: string;
  agreement_title: string;
  interest_status: PartnerInterest["status"] | null;
}

/** A row of partner_interest_contacts(): only after the owner has accepted. */
export interface InterestContact {
  interest_id: string;
  land_id: string;
  land_name: string;
  state: string;
  locality: string | null;
  village: string | null;
  feddans: number;
  latitude: number | null;
  longitude: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  decided_at: string;
}
