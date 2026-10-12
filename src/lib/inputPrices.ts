/**
 * أسعار المدخلات بالدولار — وتقدير البرنامج لتكلفة الفدان.
 *
 * The owner, 12 October 2026: the pound moves too fast to price anything in it,
 * so inputs are kept at a stable dollar price inside the app and converted at
 * the day's rate («بسعرها العالمي الثابت داخل التطبيق»).
 *
 * Fertilisers carry a true world price: the World Bank's monthly Pink Sheet.
 * It is a port price (f.o.b.), before freight, import and inland transport, so
 * a bag in a Sudanese village costs more — New Halfa farmers paid SDG 170,000 a
 * sack in 2025/26 — and the page says so.
 *
 * Diesel and labour have no world price that means anything in Sudan, so they
 * are Sudanese prices from a dated source, turned into dollars at the
 * parallel rate the same source period reports (fuel is imported at that
 * rate). Every figure names its source and month. A monthly routine reviews
 * this file against the next Pink Sheet and the WFP market monitor.
 *
 * WHAT THE ESTIMATE DOES NOT COVER
 *
 * Seed prices, land preparation, harvesting and labour days per feddan were not
 * found in a citable source for most crops. The estimate therefore adds only
 * what it can price and lists the rest by name; it is a floor, not a full cost,
 * and the farmer's own figure stays the one the study runs on.
 */

import { CROP_INPUTS } from "./cropInputs";

export interface PricedInput {
  key: string;
  ar: string;
  en: string;
  /** Dollars per unit. */
  usd: number;
  unit: { ar: string; en: string };
  date: string;
  source: string;
  note?: { ar: string; en: string };
}

const PINK_SHEET =
  "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-October-2026.pdf";

/** Pink Sheet, October 2026 edition, September 2026 monthly column, US$ per tonne. */
export const INPUT_PRICES: Record<string, PricedInput> = {
  urea: {
    key: "urea",
    ar: "يوريا",
    en: "Urea",
    usd: 407.5 / 1000,
    unit: { ar: "كجم", en: "kg" },
    date: "2026-09",
    source: PINK_SHEET,
    note: { ar: "سعر الميناء العالمي ٤٠٧٫٥ دولار للطن، قبل الشحن", en: "World port price US$407.5/t, before freight" },
  },
  DAP: {
    key: "DAP",
    ar: "داب (فوسفات ثنائي الأمونيوم)",
    en: "DAP",
    usd: 800.6 / 1000,
    unit: { ar: "كجم", en: "kg" },
    date: "2026-09",
    source: PINK_SHEET,
    note: { ar: "٨٠٠٫٦ دولار للطن", en: "US$800.6/t" },
  },
  TSP: {
    key: "TSP",
    ar: "سوبر فوسفات ثلاثي",
    en: "TSP",
    usd: 690.0 / 1000,
    unit: { ar: "كجم", en: "kg" },
    date: "2026-09",
    source: PINK_SHEET,
    note: { ar: "٦٩٠ دولاراً للطن", en: "US$690/t" },
  },
  diesel: {
    key: "diesel",
    ar: "جازولين",
    en: "Diesel",
    // SDG 42,000 a gallon (Atar, September 2026) at the WFP August 2026 parallel rate of SDG 6,150.
    usd: 42_000 / 6_150,
    unit: { ar: "جالون", en: "gallon" },
    date: "2026-09",
    source: "https://atarnetwork.com/?p=34423",
    note: {
      ar: "٤٢٬٠٠٠ جنيه للجالون في القضارف، محوّلة بسعر السوق الموازي لأغسطس 2026 (٦٬١٥٠)",
      en: "SDG 42,000 a gallon in Gedaref, converted at the August 2026 parallel rate (6,150)",
    },
  },
  labour: {
    key: "labour",
    ar: "أجرة العامل اليومية",
    en: "Daily casual wage",
    usd: 17_238 / 6_150,
    unit: { ar: "يوم", en: "day" },
    date: "2026-08",
    source: "https://logcluster.org/system/files/2026-09/market-monitor-sudan-report-september-2026.pdf",
    note: {
      ar: "المتوسط القومي ١٧٬٢٣٨ جنيهاً (برنامج الأغذية العالمي، أغسطس 2026)، وفي الجزيرة والخرطوم فوق ٢٥٬٠٠٠",
      en: "National average SDG 17,238 (WFP, August 2026); above 25,000 in Gezira and Khartoum",
    },
  },
};

/** Field-operations diesel on a Gezira feddan, as a scheme official put it (Atar, Sept 2026). */
export const DIESEL_GALLONS_PER_FEDDAN = 1;

/** Sudanese reference figures that cannot honestly be turned into dollars (no rate for their date). */
export const LOCAL_REFERENCES = [
  {
    ar: "تحضير الأرض في الجزيرة: ٥٠٠٬٠٠٠ جنيه للفدان (2025)، ويقترب من مليون",
    en: "Land preparation in Gezira: SDG 500,000 per feddan (2025), approaching one million",
    source: "https://atarnetwork.com/?p=34423",
  },
  {
    ar: "رسوم مياه الريّ: ٢٥٬٠٠٠ جنيه للفدان في الجزيرة والرهد وحلفا الجديدة (2025/26)",
    en: "Irrigation water fee: SDG 25,000 per feddan in Gezira, Rahad and New Halfa (2025/26)",
    source: "https://www.sudaninet.net/59416",
  },
  {
    ar: "جوال السماد في حلفا الجديدة: ١٧٠٬٠٠٠ جنيه (2025/26)",
    en: "A sack of fertiliser in New Halfa: SDG 170,000 (2025/26)",
    source: "https://www.dabangasudan.org/en/all-news/article/sudan-new-halfa-farmers-face-80-cost-hike",
  },
  {
    ar: "تكلفة فدان القمح في الجزيرة: تجاوزت ١٬٢٠٠٬٠٠٠ جنيه (ديسمبر 2025)",
    en: "Cost of a wheat feddan in Gezira: over SDG 1,200,000 (December 2025)",
    source: "https://www.medameek.com/?p=190815",
  },
];

export interface EstimateLine {
  ar: string;
  en: string;
  qty: string;
  usd: number;
}

export interface CostEstimate {
  lines: EstimateLine[];
  totalUsd: number;
  /** What the estimate could not price. */
  missing: { ar: string; en: string }[];
}

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const kg = (v: number) => `${Math.round(v * 10) / 10}`;

/** The platform's estimate of the input cost of one feddan, from what it can price. */
export function estimateCostPerFeddan(cropKey: string): CostEstimate | null {
  const inputs = CROP_INPUTS[cropKey];
  if (!inputs) return null;
  const lines: EstimateLine[] = [];
  const perPalm = cropKey === "dates";

  if (inputs.ureaKg) {
    const q = mid(inputs.ureaKg);
    lines.push({ ar: "يوريا", en: "Urea", qty: `${kg(q)} kg`, usd: q * INPUT_PRICES.urea.usd });
  }
  if (inputs.phosphate && !perPalm && inputs.phosphate.kind !== "NPK") {
    const p = INPUT_PRICES[inputs.phosphate.kind];
    const q = mid(inputs.phosphate.kg);
    lines.push({ ar: p.ar, en: p.en, qty: `${kg(q)} kg`, usd: q * p.usd });
  }
  lines.push({
    ar: "جازولين العمليات",
    en: "Field-operations diesel",
    qty: `${DIESEL_GALLONS_PER_FEDDAN} gal`,
    usd: DIESEL_GALLONS_PER_FEDDAN * INPUT_PRICES.diesel.usd,
  });

  const missing = [
    { ar: "ثمن البذور", en: "Seed price" },
    { ar: "أجرة الحراثة والزراعة والحصاد", en: "Ploughing, sowing and harvest hire" },
    { ar: "أيّام العمالة للفدان", en: "Labour days per feddan" },
    { ar: "المبيدات", en: "Pesticides" },
    { ar: "رسوم الريّ أو وقود الطلمبة", en: "Irrigation fee or pump fuel" },
  ];
  if (perPalm || inputs.phosphate?.kind === "NPK") missing.unshift({ ar: "سماد NPK (لا سعر عالمي منشور له)", en: "NPK fertiliser (no published world price)" });

  return { lines, totalUsd: lines.reduce((s, l) => s + l.usd, 0), missing };
}
