/**
 * «سوق المحاصيل اليوم» — أسعار بورصتي القضارف والأبيض، كلُّ رقمٍ بتاريخه ومصدره.
 *
 * The owner's approved spec, 12 October 2026: a card per crop with its price
 * in Gedaref and El Obeid, in the local unit, in pounds and in dollars, with
 * the day's arrivals, the change since the figure before, and the source.
 *
 * WHY A FILE AND NOT A FEED
 *
 * Neither bourse publishes anything a machine can read. Their daily figures
 * reach the public as a paragraph in a SUNA wire story, re-run by Sudanese
 * papers — sometimes the same day, sometimes not at all for weeks. So the
 * figures live in `content/market/prices.json`, each one copied from a story
 * that was actually read, with its URL and its market day; the page says how
 * old each one is and warns past three days, exactly as `/rates` does. A
 * figure nobody found is left out: a guessed price on a page farmers sell by
 * is worse than a gap.
 *
 * The one machine-read series is FEWS NET's monthly retail prices, shown
 * apart as a monthly reference, never mixed into the daily cards.
 *
 * Between harvests the bourses go quiet for months and the papers carry no
 * bulletin (owner, 13 October 2026: «أسعار قديمة»). The page then says so at
 * the top, with the last bulletin's date and the day we last looked, and puts
 * the newest dated figures first: WFP's monthly Market Monitor
 * (`content/market/wfp.json`, copied by hand) and FEWS NET.
 *
 * This module reads files; client components import `marketCrops.ts` instead.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PricePoint, PriceSeries } from "./marketCrops";

export * from "./marketCrops";

export interface MarketInfo {
  name_ar: string;
  name_en: string;
  bourse_ar: string;
  bourse_en: string;
}

export interface MarketPrices {
  checked: string;
  markets: Record<string, MarketInfo>;
  series: PriceSeries[];
}

const UNITS = new Set(["qintar", "ardeb", "sack", "ton"]);

const goodPoint = (p: PricePoint) =>
  p &&
  /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
  Number.isFinite(p.price) &&
  p.price > 0 &&
  /^https?:\/\//.test(p.source) &&
  (p.arrivals === undefined || (Number.isFinite(p.arrivals) && p.arrivals >= 0));

/**
 * Validates as it reads. A malformed point is dropped rather than failing the
 * page, and a series left with no points is dropped with it — one bad line in
 * a hand-edited file must not take down every other crop. Exported for tests.
 */
export function parseMarketPrices(raw: unknown): MarketPrices | null {
  const r = raw as Partial<MarketPrices> | null;
  if (!r || typeof r !== "object" || !r.markets || !Array.isArray(r.series)) return null;
  const series: PriceSeries[] = [];
  for (const s of r.series) {
    if (!s || !r.markets[s.market] || !UNITS.has(s.unit) || !Array.isArray(s.history)) continue;
    const history = s.history.filter(goodPoint).sort((a, b) => a.date.localeCompare(b.date));
    if (history.length) series.push({ ...s, history });
  }
  return { checked: String(r.checked ?? ""), markets: r.markets, series };
}

export function readMarketPrices(): MarketPrices | null {
  try {
    return parseMarketPrices(JSON.parse(readFileSync(join(process.cwd(), "content/market/prices.json"), "utf8")));
  } catch (e) {
    console.error("market: prices file unreadable", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WFP Market Monitor — the newest dated figures while the bourses are quiet
// ═══════════════════════════════════════════════════════════════════════════

/** The newest bourse figure older than this means the bourses have gone quiet, not just missed a day. */
export const BOURSE_QUIET_DAYS = 30;

export interface WfpMonthly {
  report: string;
  source: string;
  /** YYYY-MM, the month the figures describe — not the month the report came out. */
  month: string;
  gedarefAuction: {
    arrivalsTonnes: number;
    arrivalsVsLastMonthPct: number;
    priceVsLastMonthPct: number;
    priceVsLastYearPct: number;
  };
  sorghumRetailPerKg: Record<"national" | "northKordofan", { price: number; lastMonth: number }>;
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Validates as it reads: a hand-edited file with one figure wrong shows nothing rather than a wrong number. Exported for tests. */
export function parseWfpMonthly(raw: unknown): WfpMonthly | null {
  const r = raw as Partial<WfpMonthly> | null;
  if (!r || typeof r !== "object" || !/^\d{4}-\d{2}$/.test(String(r.month)) || !/^https?:\/\//.test(String(r.source))) return null;
  const a = r.gedarefAuction;
  const s = r.sorghumRetailPerKg;
  if (!a || ![a.arrivalsTonnes, a.arrivalsVsLastMonthPct, a.priceVsLastMonthPct, a.priceVsLastYearPct].every(num)) return null;
  if (!s || !(["national", "northKordofan"] as const).every((k) => s[k] && num(s[k].price) && s[k].price > 0 && num(s[k].lastMonth))) return null;
  return { report: String(r.report ?? ""), source: String(r.source), month: String(r.month), gedarefAuction: a, sorghumRetailPerKg: s };
}

export function readWfpMonthly(): WfpMonthly | null {
  try {
    return parseWfpMonthly(JSON.parse(readFileSync(join(process.cwd(), "content/market/wfp.json"), "utf8")));
  } catch (e) {
    console.error("market: WFP file unreadable", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEWS NET — the monthly reference
// ═══════════════════════════════════════════════════════════════════════════

export const FEWS_SOURCE_URL = "https://fews.net/east-africa/sudan";

/** The two bourse towns, as FEWS NET spells them. */
const FEWS_FIRST = ["Al Qadarif", "El Obeid"];

export interface FewsSeries {
  market: string;
  product: string;
  unit: string;
  currency: string;
  date: string;
  value: number;
  prev: number | null;
}

const pick = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string") return (v as { name: string }).name;
  }
  return "";
};

/**
 * The FEWS Data Warehouse's field names have shifted between versions, so each
 * one is read from the names it has had, and a record missing any of them is
 * skipped. Keeps the sorghum and millet series (the staples FEWS tracks in
 * Sudanese pounds), newest month per market — Gedaref and El Obeid first,
 * because they are the two bourse towns, then the rest newest first. Exported for tests.
 */
export function parseFews(body: unknown, max = 40): FewsSeries[] {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { results?: unknown })?.results)
      ? (body as { results: unknown[] }).results
      : [];
  const groups = new Map<string, { date: string; value: number }[]>();
  const meta = new Map<string, Omit<FewsSeries, "date" | "value" | "prev">>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const market = pick(o, ["market", "market_name"]);
    const product = pick(o, ["product", "product_name", "cpcv2_description"]);
    const unit = pick(o, ["unit", "unit_name"]);
    const currency = pick(o, ["currency", "currency_code"]);
    const date = pick(o, ["period_date", "start_date", "date"]).slice(0, 10);
    const value = Number(o.value);
    if (!market || !product || !/sorghum|millet/i.test(product) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(value) || value <= 0 || (currency && currency !== "SDG")) continue;
    const key = `${market}|${product}|${unit}`;
    meta.set(key, { market, product, unit, currency: currency || "SDG" });
    groups.set(key, [...(groups.get(key) ?? []), { date, value }]);
  }
  const out: FewsSeries[] = [];
  for (const [key, points] of groups) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2].value : null;
    out.push({ ...meta.get(key)!, date: last.date, value: last.value, prev });
  }
  const rank = (m: string) => {
    const i = FEWS_FIRST.indexOf(m);
    return i < 0 ? FEWS_FIRST.length : i;
  };
  return out
    .sort((a, b) => rank(a.market) - rank(b.market) || b.date.localeCompare(a.date) || a.market.localeCompare(b.market) || a.product.localeCompare(b.product))
    .slice(0, max);
}


const FEWS_MARKET_AR: Record<string, string> = {
  "Al Qadarif": "القضارف",
  "El Obeid": "الأبيض",
  "Ad Damazin": "الدمازين",
  "Al Foula": "الفولة",
  Dongola: "دنقلا",
  "Ed Daein": "الضعين",
  "El Fasher": "الفاشر",
  Geneina: "الجنينة",
  Kadugli: "كادقلي",
  Kassala: "كسلا",
  Khartoum: "الخرطوم",
  Kosti: "كوستي",
  Madani: "ود مدني",
  Nyala: "نيالا",
  "Port Sudan": "بورتسودان",
  Sennar: "سنار",
  Singa: "سنجة",
  Zalingei: "زالنجي",
};

/** A FEWS market in the reader's language; a town not in the list keeps FEWS's spelling. */
export const fewsMarket = (m: string, locale: string) => (locale === "en" ? m : (FEWS_MARKET_AR[m] ?? m));

/** «Sorghum» → «ذرة»; anything else keeps its English name. */
export const fewsProduct = (p: string, locale: string) =>
  locale === "en" ? p : /sorghum/i.test(p) ? "ذرة" : /millet/i.test(p) ? "دخن" : p;

/** FEWS writes units as «3_kg», «3.5_kg», «kg»: the price is for that much. */
export const fewsUnit = (u: string, locale: string) => {
  const s = u.replace(/_/g, " ").trim();
  return locale === "en" ? s : s.replace(/\bkg\b/i, "كجم");
};

/**
 * Cached for a day: FEWS publishes monthly. Null on any failure — the section
 * then says the reference could not be reached, and the daily cards stand alone.
 */
export async function fetchFewsPrices(now = new Date()): Promise<FewsSeries[] | null> {
  // Six months back is enough for "last month and the one before" even when a
  // market skips a few; the filter keeps the response small when the API honours it.
  const since = new Date(now.getTime() - 183 * 86_400_000).toISOString().slice(0, 10);
  const url = `https://fdw.fews.net/api/marketpricefacts/?country_code=SD&format=json&start_date=${since}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.error("market: FEWS NET answered", res.status);
      return null;
    }
    const series = parseFews(await res.json());
    return series.length ? series : null;
  } catch (e) {
    console.error("market: FEWS NET request failed", e);
    return null;
  }
}
