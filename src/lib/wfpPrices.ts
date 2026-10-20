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
