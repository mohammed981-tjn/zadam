/**
 * أسعار العملات — الجنيه السوداني بسعر البنك والسوق الموازي، كلٌّ بتاريخه ومصدره.
 *
 * The owner, 12 October 2026: «التكلفة الدولار مقابل الجنيه… أسعار العملات في
 * صفحة»، then «اعتماد أسعار بنك السودان وتحدَّث يومياً… من مصدر موثوق».
 *
 * WHY THERE IS NO AUTOMATIC OFFICIAL RATE
 *
 * The first version of this page read the Sudanese pound from an open FX feed
 * and showed 458 to the dollar. That figure was three and a half years old:
 * the Central Bank of Sudan's bulletin page (cbos.gov.sd/ar/exchange-rates)
 * stopped at 7 March 2022 at 447, and free feeds still repeat it. On
 * 24 August 2026 the bank left every bank to set its own rate (circular
 * 2026/16), and on 11 October 2026 the Bank of Khartoum sold the dollar at
 * 4,231.50 and the parallel market at about 9,004. A rate ten times too low
 * makes every cost on the platform ten times too cheap, so a stale automatic
 * figure is worse than none.
 *
 * So the pound comes from `content/fx/reference.json`: the Bank of Khartoum's
 * published rate (the largest bank) and the parallel market, each with the
 * date and the source it was read in. A daily routine updates that file; the
 * page says how old each figure is and warns when it is more than three days
 * old. The file sits outside CI on purpose — a daily data change must not
 * cost a test run.
 *
 * The open feed is still used, but only for what it is good at: the cross
 * rates between foreign currencies (riyals, dirhams, euros per dollar), which
 * world markets set and which do not depend on Sudan at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The currencies that matter to a Sudanese farm: export markets and remittances. */
export const FX_CURRENCIES = ["USD", "SAR", "AED", "EGP", "EUR", "GBP", "CNY", "QAR"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export const FX_NAME: Record<FxCurrency, { ar: string; en: string }> = {
  USD: { ar: "الدولار الأمريكي", en: "US dollar" },
  SAR: { ar: "الريال السعودي", en: "Saudi riyal" },
  AED: { ar: "الدرهم الإماراتي", en: "UAE dirham" },
  EGP: { ar: "الجنيه المصري", en: "Egyptian pound" },
  EUR: { ar: "اليورو", en: "Euro" },
  GBP: { ar: "الجنيه الإسترليني", en: "Pound sterling" },
  CNY: { ar: "اليوان الصيني", en: "Chinese yuan" },
  QAR: { ar: "الريال القطري", en: "Qatari riyal" },
};

export interface QuotedRate {
  date: string;
  buy: number;
  sell: number;
  source: string;
}

export interface FxReference {
  bank: QuotedRate & { name_ar: string; name_en: string };
  parallel: QuotedRate;
}

/** Days after which a quoted rate is flagged as old. */
export const FX_STALE_DAYS = 3;

export const CBOS_NOTE = {
  lastBulletin: "2022-03-07",
  liberalised: "2026-08-24",
  circular: "2026/16",
  url: "https://cbos.gov.sd/ar/exchange-rates",
  liberalisedSource: "https://sudantribune.net/article/317824",
};

export function readFxReference(): FxReference | null {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "content/fx/reference.json"), "utf8"));
    const ok = (q: QuotedRate) => q && Number.isFinite(q.buy) && Number.isFinite(q.sell) && q.sell > 0 && !!q.date;
    if (!ok(raw.bank) || !ok(raw.parallel)) return null;
    return { bank: raw.bank, parallel: raw.parallel };
  } catch (e) {
    console.error("fx: reference file unreadable", e);
    return null;
  }
}

export function ageInDays(date: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Foreign currency per one US dollar, from world markets. */
export type CrossRates = Record<FxCurrency, number>;

export const FX_SOURCE_URL = "https://www.exchangerate-api.com";
const ENDPOINT = "https://open.er-api.com/v6/latest/USD";

/** Keeps only the cross rates; the feed's SDG figure is deliberately ignored. Exported for tests. */
export function parseCrossRates(body: unknown): CrossRates | null {
  const b = body as { result?: string; rates?: Record<string, number> };
  if (b?.result !== "success" || !b.rates) return null;
  const out = {} as CrossRates;
  for (const c of FX_CURRENCIES) {
    const perUsd = c === "USD" ? 1 : b.rates[c];
    if (!Number.isFinite(perUsd) || perUsd <= 0) return null;
    out[c] = perUsd;
  }
  return out;
}

/** Cached for six hours; null on any failure, and the page then shows the dollar alone. */
export async function fetchCrossRates(): Promise<CrossRates | null> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 21_600 }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error("fx: ExchangeRate-API answered", res.status);
      return null;
    }
    return parseCrossRates(await res.json());
  } catch (e) {
    console.error("fx: request failed", e);
    return null;
  }
}

/** Pounds per one unit of each currency at a given pounds-per-dollar rate. */
export function poundsPer(sdgPerUsd: number, cross: CrossRates | null): Partial<Record<FxCurrency, number>> {
  if (!cross) return { USD: sdgPerUsd };
  const out: Partial<Record<FxCurrency, number>> = {};
  for (const c of FX_CURRENCIES) out[c] = sdgPerUsd / cross[c];
  return out;
}
