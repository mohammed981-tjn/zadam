/**
 * أسعار العملات — السعر الرسمي مقابل الجنيه السوداني.
 *
 * The owner, 12 October 2026: «التكلفة الدولار مقابل الجنيه… هل يمكن عمله
 * أسعار العملات في صفحة»، then «ابدأ صفحة أسعار العملات بالسعر الرسمي».
 *
 * The official rate comes from ExchangeRate-API's open endpoint: free, no key,
 * refreshed once a day, and its terms ask for a visible link back, which the
 * page carries. It follows official sources, so for the Sudanese pound it is
 * the official rate — not the parallel market, which in Sudan can be far
 * above it and has no feed anyone can verify. That rate will be entered by
 * hand, with its date, once the platform's database is reachable again; until
 * then the page says plainly which rate it shows.
 *
 * A failed request returns null, like the forecast: a third-party outage must
 * not take the page down, only say the rate is unavailable.
 */

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

export interface OfficialRates {
  /** Sudanese pounds for one unit of each currency. */
  sdgPer: Record<FxCurrency, number>;
  /** When the source last updated, ISO string. */
  updatedAt: string;
}

export const FX_SOURCE_URL = "https://www.exchangerate-api.com";
const ENDPOINT = "https://open.er-api.com/v6/latest/USD";

/** Turns the endpoint's USD-based answer into pounds per unit. Exported for tests. */
export function parseRates(body: unknown): OfficialRates | null {
  const b = body as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> };
  if (b?.result !== "success" || !b.rates) return null;
  const sdgPerUsd = b.rates.SDG;
  if (!Number.isFinite(sdgPerUsd) || sdgPerUsd <= 0) return null;
  const sdgPer = {} as Record<FxCurrency, number>;
  for (const c of FX_CURRENCIES) {
    const perUsd = c === "USD" ? 1 : b.rates[c];
    if (!Number.isFinite(perUsd) || perUsd <= 0) return null;
    sdgPer[c] = sdgPerUsd / perUsd;
  }
  const updatedAt = Number.isFinite(b.time_last_update_unix)
    ? new Date((b.time_last_update_unix as number) * 1000).toISOString()
    : new Date().toISOString();
  return { sdgPer, updatedAt };
}

/** Cached for six hours; the source itself changes once a day. */
export async function fetchOfficialRates(): Promise<OfficialRates | null> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("fx: ExchangeRate-API answered", res.status);
      return null;
    }
    return parseRates(await res.json());
  } catch (e) {
    console.error("fx: request failed", e);
    return null;
  }
}
