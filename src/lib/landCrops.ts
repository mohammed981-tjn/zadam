/**
 * «المحاصيل التي تناسب أرضك» (البند ١٥٢، الغنيمة الأولى).
 *
 * Konoz sells a field card that "recommends the crop from salinity, water and
 * the previous crop" behind a score nobody can check. Here every reason is a
 * rule the owner can read, with its source, from what the land already
 * records: its climate station, its water source and the water it declared per
 * feddan, its soil group from the national soil map, the crops it grew and the
 * crops its owner wants. Nothing is ranked on a number we do not have — the
 * land's own salinity is unknown until it is tested, and the list says so.
 *
 * WHAT EACH RULE READS
 *
 *  - Water: the FAO-56 engine (agronomy.ts) at the land's station, sown in the
 *    month the cited Sudanese practice gives (SOWING below), against the water
 *    the owner declared, by flood and by drip. A crop with no cited sowing
 *    month is not computed at all, rather than computed in a guessed month.
 *  - Rain-fed land: the irrigation the crop would still need after the
 *    station's average effective rain — the same engine, nothing added.
 *  - Salt: FAO Irrigation and Drainage Paper 29 (Ayers & Westcot 1985),
 *    Table 5's tolerance class and Table 4's soil salinity (ECe, dS/m) at which
 *    yield still reaches 100%. On a saline soil (Solonchak) the class decides
 *    the order; elsewhere it is shown, for a reader whose water or soil test
 *    comes back salty.
 */

import { CROPS, STATIONS, waterRequirement, type CropCoefficients } from "@/lib/agronomy";

export const FAO29_URL = "https://www.fao.org/4/t0234e/T0234E03.htm";

/** FAO-29 Table 5 class, and Table 4's ECe for 100% yield where it gives one. */
export type SaltClass = "T" | "MT" | "MS" | "S";
export const SALT: Record<string, { cls: SaltClass; ece?: number }> = {
  cotton: { cls: "T", ece: 7.7 },
  dates: { cls: "T", ece: 4.0 },
  sorghum: { cls: "MT", ece: 6.8 },
  wheat: { cls: "MT", ece: 6.0 },
  groundnut: { cls: "MS", ece: 3.2 },
  maize: { cls: "MS", ece: 1.7 },
  sugarcane: { cls: "MS", ece: 1.7 },
  alfalfa: { cls: "MS", ece: 2.0 },
  tomato: { cls: "MS", ece: 2.5 },
  sesame: { cls: "S" },
  onion: { cls: "S", ece: 1.2 },
};
// Not in FAO-29 under the same plant: pearl millet (the table has foxtail millet).

export const SALT_LABEL: Record<SaltClass, { ar: string; en: string }> = {
  T: { ar: "يتحمّل الملوحة", en: "Salt tolerant" },
  MT: { ar: "يتحمّل الملوحة بقدر", en: "Moderately tolerant" },
  MS: { ar: "حسّاسٌ للملوحة بقدر", en: "Moderately sensitive" },
  S: { ar: "حسّاسٌ للملوحة", en: "Salt sensitive" },
};
const SALT_ORDER: Record<SaltClass, number> = { T: 0, MT: 1, MS: 2, S: 3 };

/**
 * The sowing month (0 = January) where a cited Sudanese practice gives one —
 * the first month of the published window — and where it comes from.
 */
export const SOWING: Record<string, { month: number; source: { ar: string; en: string } }> = {
  wheat: { month: 10, source: { ar: "حزمة هيئة البحوث الزراعيّة: الزراعة بالسطّارة في نوفمبر", en: "ARC package: drilling in November" } },
  cotton: { month: 6, source: { ar: "الزراعة ٢٠ يوليو – ١٠ أغسطس", en: "Sowing 20 July – 10 August" } },
  sorghum: { month: 5, source: { ar: "الزراعة منتصف يونيو – منتصف يوليو", en: "Sowing mid-June – mid-July" } },
  groundnut: { month: 5, source: { ar: "الزراعة في يونيو", en: "Sowing in June" } },
  millet: { month: 5, source: { ar: "الزراعة اليدويّة يونيو – يوليو", en: "Hand sowing June – July" } },
  onion: { month: 9, source: { ar: "الشتل في أكتوبر", en: "Transplanting in October" } },
  tomato: { month: 9, source: { ar: "خطّة المحاصيل في دراسة الجدوى §٨٫١", en: "The feasibility study's crop plan, §8.1" } },
  alfalfa: { month: 10, source: { ar: "خطّة المحاصيل في دراسة الجدوى §٨٫١", en: "The feasibility study's crop plan, §8.1" } },
};

export type WaterFit = "flood" | "drip" | "short" | "unknown";

export interface CropFit {
  crop: CropCoefficients;
  /** Cubic metres per feddan for the season, at the field. */
  floodM3: number | null;
  dripM3: number | null;
  /** Rain-fed land: irrigation still needed after the average rain, m³/feddan, by flood. */
  rainShortM3: number | null;
  water: WaterFit;
  salt: { cls: SaltClass; ece?: number } | null;
  wanted: boolean;
  grownBefore: boolean;
}

export interface LandForFit {
  station_key: string;
  water_source: string;
  water_per_feddan: number | null;
  soil_class?: string | null;
  previous_crops: string | null;
  crop_keys?: string[];
}

/** Every crop with a cited sowing month, best first; and those without one. */
export function cropsForLand(land: LandForFit): { fits: CropFit[]; noMonth: CropCoefficients[]; saline: boolean; sodic: boolean } {
  const station = STATIONS.find((s) => s.key === land.station_key);
  const rainfed = land.water_source === "rainfed";
  const saline = land.soil_class === "Solonchaks";
  const sodic = land.soil_class === "Solonetz";
  const declared = land.water_per_feddan && land.water_per_feddan > 0 ? Number(land.water_per_feddan) : null;
  const wanted = new Set(land.crop_keys ?? []);
  const previous = (land.previous_crops ?? "").trim();

  const fits: CropFit[] = [];
  const noMonth: CropCoefficients[] = [];
  for (const crop of CROPS) {
    const sow = SOWING[crop.key];
    if (!sow || !station) {
      noMonth.push(crop);
      continue;
    }
    const flood = waterRequirement(crop, station, sow.month, "flood");
    const drip = waterRequirement(crop, station, sow.month, "drip");
    const floodM3 = Math.round(flood.m3PerFeddan);
    const dripM3 = Math.round(drip.m3PerFeddan);
    let water: WaterFit = "unknown";
    if (!rainfed && declared != null) water = declared >= floodM3 ? "flood" : declared >= dripM3 ? "drip" : "short";
    fits.push({
      crop,
      floodM3: rainfed ? null : floodM3,
      dripM3: rainfed ? null : dripM3,
      rainShortM3: rainfed ? floodM3 : null,
      water,
      salt: SALT[crop.key] ?? null,
      wanted: wanted.has(crop.key),
      grownBefore: previous.length > 0 && previous.includes(crop.name),
    });
  }

  const waterRank: Record<WaterFit, number> = { flood: 0, drip: 1, unknown: 2, short: 3 };
  fits.sort((a, b) => {
    // On a saline soil the salt class comes first; a crop FAO-29 does not list goes last.
    if (saline) {
      const sa = a.salt ? SALT_ORDER[a.salt.cls] : 9;
      const sb = b.salt ? SALT_ORDER[b.salt.cls] : 9;
      if (sa !== sb) return sa - sb;
    }
    if (waterRank[a.water] !== waterRank[b.water]) return waterRank[a.water] - waterRank[b.water];
    const na = a.rainShortM3 ?? a.dripM3 ?? 0;
    const nb = b.rainShortM3 ?? b.dripM3 ?? 0;
    return na - nb;
  });
  return { fits, noMonth, saline, sodic };
}
