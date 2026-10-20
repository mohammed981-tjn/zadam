/**
 * The day's gold price (backlog 115: «سعر الذهب اليومي ضروري»).
 *
 * The spot price comes from gold-api.com, which is free, needs no key and says
 * it may be used on a website — unlike the LBMA benchmark, which needs a
 * licence to republish. The page then applies the central bank's own rule,
 * Circular 13/2026: world price per troy ounce minus US$10, divided by
 * 31.1035 grams. That gives the reference a seller can check; the binding
 * price is still the one the bank announces through its XAR system.
 */

export const GOLD_SOURCE_URL = "https://gold-api.com/";
const ENDPOINT = "https://api.gold-api.com/price/XAU";

/** Grams in a troy ounce, as Circular 13/2026 writes it. */
export const GRAMS_PER_TROY_OUNCE = 31.1035;
/** The circular's discount, in dollars per ounce. */
export const CIRCULAR_DISCOUNT_USD = 10;

export interface GoldSpot {
  usdPerOunce: number;
  updatedAt: string;
}

/** Null unless the answer is gold, in dollars, with a positive price and an ISO time. */
export function parseGoldSpot(raw: unknown): GoldSpot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.symbol !== "XAU" || r.currency !== "USD") return null;
  if (typeof r.price !== "number" || !Number.isFinite(r.price) || r.price <= 0) return null;
  if (typeof r.updatedAt !== "string" || Number.isNaN(Date.parse(r.updatedAt))) return null;
  return { usdPerOunce: r.price, updatedAt: r.updatedAt };
}

/** Dollars per gram of 24-karat gold, before any rule. */
export const usdPerGram = (usdPerOunce: number) => usdPerOunce / GRAMS_PER_TROY_OUNCE;

/** Circular 13/2026: (world price − 10) ÷ 31.1035, times purity for gold below 24 karat. */
export function circularUsdPerGram(usdPerOunce: number, karat = 24): number {
  return ((usdPerOunce - CIRCULAR_DISCOUNT_USD) / GRAMS_PER_TROY_OUNCE) * (karat / 24);
}

/**
 * Cached for an hour: the page is "today's price", and an hour keeps the
 * figure close to the market without asking the source on every visit. Null
 * on any failure — the page then says the price could not be read.
 */
export async function fetchGoldSpot(): Promise<GoldSpot | null> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 3_600 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error("gold: gold-api answered", res.status);
      return null;
    }
    return parseGoldSpot(await res.json());
  } catch (e) {
    console.error("gold: gold-api request failed", e);
    return null;
  }
}
