/**
 * قيمة المحصول القائم تقديراً — تُعرض ولا تُقيَّد (قرار المالك، 6 نوفمبر 2026: «تقدير يُعرض ولا يُقيَّد»).
 *
 * WHY NOT IN THE BOOKS
 *
 * IAS 41 would carry a standing crop at fair value less costs to sell, re-measured each period. That needs a market
 * price the farmer could actually sell at, for this crop, near him — and for most of the crops on the platform there
 * is none: the bourses quote a handful, in units some of which (the ardeb) weigh differently per crop, and they go
 * quiet between harvests. A figure the books carried would move the farmer's profit on a number nobody traded. So the
 * owner chose to show the estimate on the season page and keep the books at cost; the harvest is valued when sold.
 *
 * HOW
 *
 * Expected harvest = feddans × Sudan's national yield (FAOSTAT, kg/ha) × hectares per feddan. Price, in order: the
 * latest bourse figure for this crop in a unit with a fixed weight (the qintar, 45 kg; the tonne), else FAOSTAT's
 * price per tonne (Sudan's export unit value, else a regional producer price), each labelled with where it came
 * from. No yield, or no price, means no estimate — never a borrowed one.
 */

import { HECTARES_PER_FEDDAN, type PriceBasis } from "./cropBenchmark";
import type { PriceSeries } from "./marketCrops";

/** Kilograms in the bourse units whose weight does not depend on the crop. The ardeb does, so it is left out. */
const UNIT_KG: Partial<Record<PriceSeries["unit"], number>> = { qintar: 45, ton: 1000 };

/** The season's crop key → the bourse crops that price it. */
export const BOURSE_CROPS: Record<string, readonly string[]> = {
  sesame: ["sesame", "sesame_red"],
  groundnut: ["groundnut"],
};

export interface BoursePrice {
  poundsPerKg: number;
  date: string;
  market: string;
  crop: string;
  source: string;
}

/** The newest bourse figure for this crop in a unit with a fixed weight, or null. */
export function boursePriceFor(cropKey: string, series: readonly PriceSeries[]): BoursePrice | null {
  const crops = BOURSE_CROPS[cropKey];
  if (!crops) return null;
  let best: BoursePrice | null = null;
  for (const s of series) {
    const kg = UNIT_KG[s.unit];
    if (!kg || !crops.includes(s.crop)) continue;
    const last = s.history.at(-1);
    if (!last || !(last.price > 0)) continue;
    if (!best || last.date > best.date) {
      best = { poundsPerKg: last.price / kg, date: last.date, market: s.market, crop: s.crop, source: last.source };
    }
  }
  return best;
}

export type ValueBasis = "bourse" | Exclude<PriceBasis, "none">;

export interface CropValueEstimate {
  kg: number;
  kgPerFeddan: number;
  /** Null when the price is in pounds and no dollar rate was given. */
  usd: number | null;
  /** Null when the price is in dollars and no pound rate was given. */
  pounds: number | null;
  basis: ValueBasis;
  /** The bourse day, or FAOSTAT's year. */
  priceWhen: string;
  yieldYear: number | null;
}

export function standingCropValue(input: {
  feddans: number;
  sudanKgPerHa: number | null;
  yieldYear: number | null;
  bourse: BoursePrice | null;
  faostat: { usdPerTonne: number | null; basis: PriceBasis; year: number | null } | null;
  poundsPerDollar: number | null;
}): CropValueEstimate | null {
  const { feddans, sudanKgPerHa, bourse, faostat, poundsPerDollar } = input;
  if (!(feddans > 0) || !(sudanKgPerHa != null && sudanKgPerHa > 0)) return null;
  const rate = poundsPerDollar != null && poundsPerDollar > 0 ? poundsPerDollar : null;
  const kgPerFeddan = sudanKgPerHa * HECTARES_PER_FEDDAN;
  const kg = kgPerFeddan * feddans;

  if (bourse && bourse.poundsPerKg > 0) {
    const pounds = kg * bourse.poundsPerKg;
    return { kg, kgPerFeddan, pounds, usd: rate ? pounds / rate : null, basis: "bourse", priceWhen: bourse.date, yieldYear: input.yieldYear };
  }
  if (faostat && faostat.basis !== "none" && faostat.usdPerTonne != null && faostat.usdPerTonne > 0) {
    const usd = (kg / 1000) * faostat.usdPerTonne;
    return {
      kg,
      kgPerFeddan,
      usd,
      pounds: rate ? usd * rate : null,
      basis: faostat.basis,
      priceWhen: faostat.year != null ? String(faostat.year) : "",
      yieldYear: input.yieldYear,
    };
  }
  return null;
}
