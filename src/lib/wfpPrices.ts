import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tr, type Locale } from "@/lib/i18n";

/**
 * WFP's retail prices in Sudan's towns, from its price database on HDX
 * (backlog 113). The monthly job .github/workflows/wfp-prices.yml fetches the
 * file and scripts/wfp-prices-trim.py keeps each town's newest month per item;
 * this reads that trim. Every number is one WFP wrote for that month — the page
 * only adds the change against the month and the year before, from the same
 * item's own figures.
 */

export const WFP_PRICES_SOURCE = "https://data.humdata.org/dataset/wfp-food-prices-for-sudan";

export interface WfpItem {
  commodity: string;
  unit: string;
  month: string;
  price: number;
  prevMonth: number | null;
  yearAgo: number | null;
}

export interface WfpTown {
  market: string;
  state: string;
  latest: string;
  items: WfpItem[];
}

export interface WfpPrices {
  latest: string;
  fetched: string;
  towns: WfpTown[];
}

const YM = /^\d{4}-\d{2}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** A row with a bad month or a price that is not a positive number is dropped, not shown as zero. */
export function parseWfpPrices(raw: unknown): WfpPrices | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.latest !== "string" || !YM.test(r.latest) || !Array.isArray(r.markets)) return null;
  const towns: WfpTown[] = [];
  for (const m of r.markets as Record<string, unknown>[]) {
    if (!m || typeof m.market !== "string" || !Array.isArray(m.items)) continue;
    const items: WfpItem[] = [];
    for (const i of m.items as Record<string, unknown>[]) {
      const price = num(i?.price);
      if (!i || typeof i.commodity !== "string" || typeof i.unit !== "string" || typeof i.month !== "string" || !YM.test(i.month) || price === null) continue;
      if (i.type !== undefined && i.type !== "retail") continue;
      items.push({ commodity: i.commodity, unit: i.unit, month: i.month, price, prevMonth: num(i.prevMonth), yearAgo: num(i.yearAgo) });
    }
    if (!items.length) continue;
    towns.push({
      market: m.market,
      state: typeof m.state === "string" ? m.state : "",
      latest: items.reduce((a, i) => (i.month > a ? i.month : a), items[0].month),
      items,
    });
  }
  return towns.length ? { latest: r.latest, fetched: typeof r.fetched === "string" ? r.fetched : "", towns } : null;
}

export function readWfpPrices(): WfpPrices | null {
  try {
    return parseWfpPrices(JSON.parse(readFileSync(join(process.cwd(), "content/market/wfp-prices.json"), "utf8")));
  } catch (e) {
    console.error("market: WFP prices file unreadable", e);
    return null;
  }
}

/**
 * Where WFP collects a town's prices, when the place is not the town the name
 * suggests (backlog 133). Read in the HDX file's own `admin2` column on
 * 22 October 2026: WFP's "Khartoum" is one market in Jebel Aulia locality,
 * south of the city — not the city's markets at large. Every other town's
 * admin2 is the town itself or the locality that holds it.
 */
const MARKET_PLACE: Record<string, string> = {
  Khartoum: "سوقٌ في محلّيّة جبل أولياء",
};
const MARKET_PLACE_EN: Record<string, string> = {
  Khartoum: "one market in Jebel Aulia locality",
};
export const wfpMarketPlace = (name: string, locale: Locale): string | null =>
  (locale === "en" ? MARKET_PLACE_EN[name] : MARKET_PLACE[name]) ?? null;

/**
 * The middle of the towns' prices for one item in one month (backlog 133).
 *
 * The owner asked how faba beans can cost more in Dongola than in Khartoum.
 * WFP's own September 2026 national average for them is SDG 12,345/kg
 * (Sudan Market Monitor, October 2026, Annex 2); Dongola's 13,688 sits by it
 * and Khartoum's 6,719 at about half. So the page shows, beside a town's
 * figure, how far it lies from the other towns that month — computed from the
 * same file, never estimated — and says when it lies far out. The median, not
 * the mean, so one far-off town does not move the middle it is measured from.
 * Only when at least five towns report the item that month.
 */
export const MEDIAN_MIN_TOWNS = 5;
/** Further than this from the median, below or above, a figure is called unusual: 0.6× and 1/0.6 ≈ 1.67×. */
export const UNUSUAL_LOW = 0.6;
export const UNUSUAL_HIGH = 1 / UNUSUAL_LOW;

const medianKey = (it: Pick<WfpItem, "commodity" | "unit" | "month">) => `${it.commodity}|${it.unit}|${it.month}`;

export function townMedians(towns: WfpTown[]): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const town of towns) for (const it of town.items) {
    const k = medianKey(it);
    groups.set(k, [...(groups.get(k) ?? []), it.price]);
  }
  const out = new Map<string, number>();
  for (const [k, prices] of groups) {
    if (prices.length < MEDIAN_MIN_TOWNS) continue;
    const s = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    out.set(k, s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
  }
  return out;
}

export const medianFor = (medians: Map<string, number>, it: WfpItem) => medians.get(medianKey(it)) ?? null;

/** "low" or "high" when the figure lies far from the towns' median that month; null otherwise. */
export function unusual(price: number, median: number | null): "low" | "high" | null {
  if (median === null || median <= 0) return null;
  const r = price / median;
  return r < UNUSUAL_LOW ? "low" : r > UNUSUAL_HIGH ? "high" : null;
}

/** Whole per cent, or null when there is nothing to compare with. */
export function pctChange(now: number, before: number | null): number | null {
  if (before === null || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** The two bourse towns first, then the rest by their Arabic name. */
export const WFP_FIRST = ["El Obeid", "El Gedarif"];

const TOWN: Record<string, string> = {
  "Al Fashir": "الفاشر",
  Damazin: "الدمازين",
  Dongola: "دنقلا",
  "Ed Damer": "الدامر",
  Eddein: "الضعين",
  "El Fula": "الفولة",
  "El Gedarif": "القضارف",
  "El Geneina": "الجنينة",
  "El Obeid": "الأبيض",
  Kadugli: "كادقلي",
  Kassala: "كسلا",
  Khartoum: "الخرطوم",
  Kosti: "كوستي",
  "Nyala El Kabeer": "نيالا",
  "Port Sudan": "بورتسودان",
  Singa: "سنجة",
  Tawila: "طويلة",
  "Wad Medani": "ود مدني",
  Zalingi: "زالنجي",
};

const ITEM: Record<string, string> = {
  "Beans (fava, egyptian)": "فول مصري",
  "Meat (beef)": "لحم بقري",
  "Meat (goat)": "لحم ماعز",
  "Milk (powder)": "لبن بودرة",
  Millet: "دخن",
  "Oil (vegetable)": "زيت طعام",
  Onions: "بصل",
  "Salt (iodised)": "ملح",
  Sorghum: "ذرة",
  "Sorghum (food aid)": "ذرة (من الإغاثة)",
  Sugar: "سكر",
  "Tomatoes (dried)": "طماطم مجفّفة",
  "Wheat flour": "دقيق قمح",
};

const UNIT: Record<string, string> = { KG: "كجم", L: "لتر" };

/** WFP's English when a name is not in the list, never a guess. */
export const wfpTown = (name: string, locale: Locale) => (locale === "en" ? name : (TOWN[name] ?? name));
export const wfpItem = (name: string, locale: Locale) => (locale === "en" ? name : (ITEM[name] ?? name));
export function wfpUnit(unit: string, locale: Locale): string {
  const m = /^([\d.]+)\s*(KG|L)$/i.exec(unit.trim());
  if (m) return tr(locale, `${m[1]} ${UNIT[m[2].toUpperCase()]}`, `${m[1]} ${m[2].toLowerCase()}`);
  if (UNIT[unit]) return tr(locale, UNIT[unit], unit.toLowerCase());
  return unit;
}

export function orderTowns(towns: WfpTown[], locale: Locale): WfpTown[] {
  const first = WFP_FIRST.map((n) => towns.find((t) => t.market === n)).filter((t): t is WfpTown => !!t);
  const rest = towns
    .filter((t) => !WFP_FIRST.includes(t.market))
    .sort((a, b) => wfpTown(a.market, locale).localeCompare(wfpTown(b.market, locale), locale === "en" ? "en" : "ar"));
  return [...first, ...rest];
}
