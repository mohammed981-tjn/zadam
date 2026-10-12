/**
 * عروض البيع والشراء — الأنواع والقوائم المغلقة، وكشفُ «الجدول لم يُنشأ بعد».
 *
 * The table and its two functions come from
 * supabase/migrations/20261012120000_market_offers.sql. Until that migration
 * is applied in production, every query here fails with "relation does not
 * exist" (or PostgREST's "could not find the table / function"); the pages
 * read that as «تُفعَّل قريباً» rather than as an error, so shipping the code
 * before the database is not a broken page.
 */

import type { Locale } from "./i18n";

export type OfferKind = "sell" | "buy";
export type OfferUnit = "qintar" | "ardeb" | "sack" | "ton" | "kg";

export interface MarketOffer {
  id: string;
  kind: OfferKind;
  crop: string;
  quantity: number;
  unit: OfferUnit;
  grade: string | null;
  state: string;
  locality: string;
  price_sdg: number | null;
  price_usd: number | null;
  contact_phone: string;
  whatsapp: boolean;
  notes: string | null;
  status: "open" | "closed";
  expires_at: string;
  created_by: string;
  created_at: string;
}

export const OFFER_UNITS: OfferUnit[] = ["qintar", "ardeb", "sack", "ton", "kg"];

export const OFFER_UNIT_NAME: Record<OfferUnit, { ar: string; en: string }> = {
  qintar: { ar: "قنطار", en: "qintar" },
  ardeb: { ar: "أردب", en: "ardeb" },
  sack: { ar: "جوال", en: "sack" },
  ton: { ar: "طن", en: "tonne" },
  kg: { ar: "كيلوغرام", en: "kg" },
};

/**
 * The crops a filter offers. The column is free text — a trader may sell
 * something not on this list — but the filter and the form suggest these, so
 * the same crop is not spelt five ways.
 */
export const OFFER_CROPS: { ar: string; en: string }[] = [
  { ar: "سمسم", en: "Sesame" },
  { ar: "ذرة", en: "Sorghum" },
  { ar: "دخن", en: "Millet" },
  { ar: "فول سوداني", en: "Groundnut" },
  { ar: "صمغ عربي", en: "Gum arabic" },
  { ar: "كركدي", en: "Hibiscus" },
  { ar: "حب البطيخ", en: "Watermelon seed" },
  { ar: "قمح", en: "Wheat" },
  { ar: "زهرة الشمس", en: "Sunflower" },
  { ar: "قطن", en: "Cotton" },
];

export const offerCropName = (crop: string, locale: Locale) =>
  locale === "en" ? (OFFER_CROPS.find((c) => c.ar === crop)?.en ?? crop) : crop;

/** True when the error means the migration has not been applied yet. */
export function isNotYetCreated(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")) return true;
  return /does not exist|could not find the (table|function)|schema cache/i.test(error.message ?? "");
}
