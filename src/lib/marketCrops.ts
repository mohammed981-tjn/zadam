/**
 * أسماء المحاصيل ووحدات السوق — آمنةٌ لمكوّنات العميل (لا قراءة ملفات). See marketPrices.ts.
 *
 * WHY LOCAL UNITS FIRST
 *
 * A farmer in Gedaref sells sesame by the qintar and sorghum by the ardeb; a
 * price per tonne is a number he has to convert before it means anything, and
 * a conversion is where a wrong figure hides. So each price is shown in the
 * unit the bourse quoted it in, with the unit named beside it, and the dollar
 * beside that for the trader who thinks in export terms.
 */

import type { Locale } from "./i18n";

export type MarketUnit = "qintar" | "ardeb" | "sack" | "ton";

export const UNIT_NAME: Record<MarketUnit, { ar: string; en: string; noteAr: string; noteEn: string }> = {
  qintar: {
    ar: "القنطار",
    en: "qintar",
    noteAr: "القنطار ٤٥ كيلوغراماً (١٠٠ رطل).",
    noteEn: "A qintar is 45 kg (100 ratl).",
  },
  ardeb: {
    ar: "الأردب",
    en: "ardeb",
    noteAr: "الأردب كيلٌ سوداني، يختلف وزنه باختلاف المحصول.",
    noteEn: "The ardeb is a Sudanese dry measure; its weight differs from crop to crop.",
  },
  sack: { ar: "الجوال", en: "sack", noteAr: "", noteEn: "" },
  ton: { ar: "الطن", en: "tonne", noteAr: "", noteEn: "" },
};

export const CROP_NAME: Record<string, { ar: string; en: string }> = {
  sesame: { ar: "السمسم", en: "Sesame" },
  sesame_red: { ar: "السمسم الأحمر", en: "Red sesame" },
  feterita: { ar: "الذرة — فتريتة", en: "Sorghum — feterita" },
  tabat: { ar: "الذرة — طابت", en: "Sorghum — tabat" },
  millet: { ar: "الدخن", en: "Millet" },
  gum_hashab: { ar: "الصمغ العربي — هشاب", en: "Gum arabic — hashab" },
  groundnut: { ar: "الفول السوداني الخام", en: "Groundnut, unshelled" },
  hibiscus: { ar: "الكركدي", en: "Hibiscus" },
};

export const cropName = (crop: string, locale: Locale) =>
  (locale === "en" ? CROP_NAME[crop]?.en : CROP_NAME[crop]?.ar) ?? crop;

/** Days after which a market figure is flagged as old — the same rule as exchange rates. */
export const MARKET_STALE_DAYS = 3;

export interface PricePoint {
  date: string;
  price: number;
  arrivals?: number;
  source: string;
  note?: string;
}

export interface PriceSeries {
  market: string;
  crop: string;
  unit: MarketUnit;
  history: PricePoint[];
}

/** The key a series is stored and alerted under: `gedaref:sesame`. */
export const seriesKey = (s: Pick<PriceSeries, "market" | "crop">) => `${s.market}:${s.crop}`;

/** The latest figure and the one before it; `change` is null when there is only one. */
export function latest(s: PriceSeries) {
  const h = s.history;
  const last = h[h.length - 1];
  const prev = h.length > 1 ? h[h.length - 2] : null;
  return {
    last,
    prev,
    change: prev ? last.price - prev.price : null,
    changePct: prev && prev.price > 0 ? ((last.price - prev.price) / prev.price) * 100 : null,
  };
}

export const money = (v: number, digits = 0) => v.toLocaleString("en-US", { maximumFractionDigits: digits });
