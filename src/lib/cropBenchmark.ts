/**
 * مرجعية غلة المحاصيل وأسعارها — الربط بين مفاتيح المنصّة وبيانات FAOSTAT.
 *
 * WHAT THIS FILE USED TO SAY, AND WHY IT CHANGED
 *
 * It shipped almost empty, holding three sorghum figures and a long note
 * explaining that FAOSTAT, yieldgap.org and Our World in Data were all blocked
 * by the build environment's egress policy, so the table could not be filled
 * without inventing it.
 *
 * The data is loaded now — 63,150 FAOSTAT observations across production,
 * producer prices and trade — so the numbers no longer belong in this file at
 * all. They live in faostat_observations, where a new FAO release is a load
 * rather than a deploy. What belongs here is the part that is a *decision*
 * rather than a measurement: which FAOSTAT item answers to which crop key,
 * which countries are a fair comparison, and which price to believe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE COMPARISON PROBLEM, WHICH IS THE WHOLE REASON THIS FILE EXISTS
 *
 * The obvious benchmark is the highest yield in the data. It is also useless,
 * and shown to a farmer it is dishonest. Taking the maximum across the loaded
 * countries for 2023 gives:
 *
 *   tomatoes   Belgium   452,656 kg/ha    (glasshouse, hydroponic)
 *   maize      Israel     17,409 kg/ha    (sweet corn, not grain)
 *   sorghum    Israel     13,071 kg/ha    (irrigated specialist area)
 *   millet     Mexico     12,759 kg/ha    (a different crop under one label)
 *
 * Sudan's tomato yield is 13,623 kg/ha. Against Belgium that reads as "3% of
 * what is possible", which tells a farmer in Kassala nothing except that the
 * platform does not understand their situation. The gap there is not agronomy.
 * It is glass.
 *
 * So the comparison is drawn against a peer group: arid and semi-arid countries
 * growing the same crops in open fields. Egypt is named separately because it
 * is the sharpest single comparison available — same river, same climate band,
 * the same crops irrigated — and because the gap to Egypt is the one that is
 * actually closable.
 *
 * The peer group's median is used rather than its maximum, for the same reason
 * in miniature: one specialist producer should not set the bar.
 */

import type { StageKey } from "./season";

/**
 * Crop key → the FAOSTAT item that answers for it.
 *
 * Alfalfa is deliberately absent: FAOSTAT publishes no yield for it under any
 * name in the loaded domains, so a study of alfalfa reports having no market
 * reference rather than borrowing another crop's.
 */
export const FAOSTAT_ITEM: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize (corn)",
  cotton: "Seed cotton, unginned",
  groundnut: "Groundnuts, excluding shelled",
  sesame: "Sesame seed",
  onion: "Onions and shallots, dry (excluding dehydrated)",
  tomato: "Tomatoes",
  sugarcane: "Sugar cane",
  millet: "Millet",
  dates: "Dates",
};

/** Arid and semi-arid open-field producers — a fair comparison for Sudan. */
export const PEER_AREAS = [
  "Egypt",
  "Ethiopia",
  "India",
  "Niger",
  "Iraq",
  "Algeria",
  "Saudi Arabia",
] as const;

/** The single sharpest comparison: same river, same climate band, irrigated. */
export const NEAREST_PEER = "Egypt";

/**
 * Where a price came from, in the order the study prefers them.
 *
 * The ordering is not arbitrary. Sudan's own export unit value — trade value
 * divided by trade quantity — is money Sudan actually received, which beats any
 * other country's price for answering "what will this fetch". It is also the
 * only price of Sudanese origin available at all: FAOSTAT publishes no producer
 * prices for Sudan whatsoever, across every year loaded.
 *
 * A regional producer price is the fallback, and it is a genuinely worse
 * number — another country's farm gate under another currency regime. It is
 * labelled as such wherever it appears rather than quietly substituted.
 */
export type PriceBasis =
  | "sudan_export"
  | "regional_producer"
  | "manual"
  | "none";

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  sudan_export: "قيمة الوحدة التصديرية للسودان",
  regional_producer: "سعر منتِج إقليمي (تقريبي)",
  manual: "سعر أدخلتَه بنفسك",
  none: "لا سعر متاح",
};

export const PRICE_BASIS_NOTE: Record<PriceBasis, string> = {
  sudan_export:
    "قيمة الصادر مقسومة على كميته — مالٌ قبضه السودان فعلاً، وهو أدقّ ما يُقال عن سعر المحصول.",
  regional_producer:
    "متوسط سعر المنتِج في مصر وإثيوبيا والهند والنيجر والعراق والجزائر والسعودية. FAOSTAT لا ينشر أي سعر منتِج للسودان إطلاقاً، فهذا بديلٌ أضعف — بلدٌ آخر ونظام عملة آخر.",
  manual: "أدخلتَ السعر بنفسك، فهو يعلو على أي تقدير.",
  none: "لا سعر لهذا المحصول في البيانات المحمَّلة. أدخِل سعراً لتكتمل الدراسة.",
};

/** One feddan is 4,200 m² and one hectare is 10,000 — so 0.42 of a hectare. */
export const HECTARES_PER_FEDDAN = 0.4201;

/** What the market says about one crop, assembled from faostat_observations. */
export interface CropMarket {
  cropKey: string;
  faostatItem: string | null;
  /** Sudan's own measured yield, kg/ha. */
  sudanKgPerHa: number | null;
  /** Egypt — the nearest comparable irrigated system. */
  nearestPeerKgPerHa: number | null;
  /** Median of the peer group, used instead of its maximum. */
  peerMedianKgPerHa: number | null;
  usdPerTonne: number | null;
  priceBasis: PriceBasis;
  year: number | null;
}

/** Gross revenue for a yield, in dollars. Null when no price is known. */
export function grossRevenue(
  kgPerHa: number | null,
  feddans: number,
  usdPerTonne: number | null,
): number | null {
  if (kgPerHa === null || usdPerTonne === null) return null;
  if (!Number.isFinite(feddans) || feddans <= 0) return null;
  if (kgPerHa < 0 || usdPerTonne < 0) return null;
  return (kgPerHa / 1000) * HECTARES_PER_FEDDAN * feddans * usdPerTonne;
}

/**
 * The yield needed to bring back a given amount of money.
 *
 * This is the number the whole phased study turns on: it converts a sum already
 * spent into the harvest required to recover it, which is the only form in
 * which the decision to continue can actually be judged.
 */
export function breakEvenYieldKgPerHa(
  cost: number,
  feddans: number,
  usdPerTonne: number | null,
): number | null {
  if (usdPerTonne === null || usdPerTonne <= 0) return null;
  if (!Number.isFinite(feddans) || feddans <= 0) return null;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return (cost * 1000) / (HECTARES_PER_FEDDAN * feddans * usdPerTonne);
}

/** The crop stages that carry field cost, in the order they are committed. */
export const COMMITTING_STAGES: StageKey[] = [
  "land_prep",
  "planting",
  "establishment",
  "vegetative",
  "flowering",
  "maturity",
  "harvest",
];
