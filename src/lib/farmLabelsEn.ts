import type { Locale } from "./i18n";
import {
  CROPS,
  STATIONS,
  IRRIGATION_LABEL,
  type IrrigationMethod,
} from "./agronomy";
import { WATER_SOURCE_LABEL, WATER_SOURCE_LABEL_EN, type WaterSource } from "./risk";
import {
  LEDGER_LABEL,
  STAGE_TEMPLATES,
  type LedgerCategory,
  type StageKey,
} from "./season";

/**
 * English names for the farm vocabulary the land and season pages show. The
 * Arabic stays where it is (agronomy, risk, season); these sit beside it so
 * those shared modules are untouched while the pages are translated.
 */

const CROP_EN: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize",
  cotton: "Cotton",
  groundnut: "Groundnut",
  sesame: "Sesame",
  alfalfa: "Alfalfa",
  onion: "Onion",
  tomato: "Tomato",
  sugarcane: "Sugarcane",
  millet: "Pearl millet",
  dates: "Date palm",
  faba_bean: "Faba bean",
  potato: "Potato",
  sunflower: "Sunflower",
  safflower: "Safflower",
  barley: "Barley",
  rice: "Rice",
  cowpea: "Cowpea",
  watermelon: "Watermelon",
  sweet_melon: "Sweet melon",
  cucumber: "Cucumber",
  eggplant: "Eggplant",
  sweet_pepper: "Sweet pepper",
  cabbage: "Cabbage",
  carrot: "Carrot",
  zucchini: "Zucchini",
  sweet_potato: "Sweet potato",
  citrus: "Citrus (grapefruit)",
};

const STATION_EN: Record<string, string> = {
  khartoum: "Khartoum",
  gezira: "Gezira (Wad Madani)",
  rivernile: "River Nile (Atbara)",
  northern: "Northern (Dongola)",
  kordofan: "North Kordofan (El Obeid)",
  kassala: "Kassala",
  nyala: "South Darfur (Nyala)",
  elfasher: "North Darfur (El Fasher)",
  damazin: "Blue Nile (Ed Damazin)",
  kosti: "White Nile (Kosti)",
  geneina: "West Darfur (El Geneina)",
  zalingei: "Central Darfur (Zalingei)",
  eddaein: "East Darfur (Ed Daein)",
  kurmuk: "Blue Nile (Kurmuk)",
  sennar: "Sennar",
};

const WATER_SOURCE_EN = WATER_SOURCE_LABEL_EN;

const IRRIGATION_EN: Record<IrrigationMethod, string> = {
  flood: "Flood irrigation",
  sprinkler: "Sprinkler irrigation",
  pivot: "Centre pivot",
  drip: "Drip irrigation",
};

const LEDGER_EN: Record<LedgerCategory, string> = {
  seeds: "Seeds",
  fertiliser: "Fertiliser",
  pesticide: "Pesticides",
  labour: "Labour",
  irrigation: "Irrigation and fuel",
  transport: "Transport",
  other: "Other",
  revenue: "Revenue",
};

const STAGE_EN: Record<StageKey, { name: string; activities: string[] }> = {
  land_prep: {
    name: "Land preparation",
    activities: [
      "Ploughing and levelling",
      "Opening canals or laying irrigation lines",
      "Applying base fertiliser",
    ],
  },
  planting: {
    name: "Planting",
    activities: [
      "Buying certified seed",
      "Seed treatment",
      "Sowing and the first irrigation",
    ],
  },
  establishment: {
    name: "Emergence and establishment",
    activities: ["Monitoring emergence", "Gap filling", "First weed control"],
  },
  vegetative: {
    name: "Vegetative growth",
    activities: ["Nitrogen fertiliser", "Regular irrigation", "Pest monitoring"],
  },
  flowering: {
    name: "Flowering and fruit set",
    activities: [
      "Irrigate precisely on time — the stage most sensitive to water stress",
      "Potassium fertiliser",
      "Controlling flowering pests",
    ],
  },
  maturity: {
    name: "Maturity",
    activities: [
      "Gradually reducing irrigation",
      "Preparing for harvest",
      "Estimating the expected yield",
    ],
  },
  harvest: {
    name: "Harvest and after",
    activities: [
      "Harvesting",
      "Drying and cleaning",
      "Storage or delivery to the buyer",
    ],
  },
};

export function cropName(key: string, locale: Locale): string {
  if (locale === "en" && CROP_EN[key]) return CROP_EN[key];
  return CROPS.find((c) => c.key === key)?.name ?? key;
}

export function stationName(key: string, locale: Locale): string {
  if (locale === "en" && STATION_EN[key]) return STATION_EN[key];
  return STATIONS.find((s) => s.key === key)?.name ?? key;
}

export function waterSourceLabel(key: string, locale: Locale): string {
  // Own keys only: a stored "toString" would otherwise come back as a function (app-api-3).
  if (!Object.hasOwn(WATER_SOURCE_LABEL, key)) return key;
  const k = key as WaterSource;
  if (locale === "en" && WATER_SOURCE_EN[k]) return WATER_SOURCE_EN[k];
  return WATER_SOURCE_LABEL[k];
}

export function irrigationLabel(key: string, locale: Locale): string {
  const k = key as IrrigationMethod;
  if (locale === "en" && IRRIGATION_EN[k]) return IRRIGATION_EN[k];
  return IRRIGATION_LABEL[k] ?? key;
}

export function ledgerLabel(key: string, locale: Locale): string {
  const k = key as LedgerCategory;
  if (locale === "en" && LEDGER_EN[k]) return LEDGER_EN[k];
  return LEDGER_LABEL[k] ?? key;
}

export function stageName(key: string, locale: Locale): string {
  const k = key as StageKey;
  if (locale === "en" && STAGE_EN[k]) return STAGE_EN[k].name;
  return STAGE_TEMPLATES[k]?.name ?? key;
}

export function stageActivities(key: string, locale: Locale): string[] {
  const k = key as StageKey;
  if (locale === "en" && STAGE_EN[k]) return STAGE_EN[k].activities;
  return STAGE_TEMPLATES[k]?.activities ?? [];
}

/**
 * The English reason beside `disbursementDecision`. It follows the same order
 * of checks, so the sentence matches the decision the Arabic one explains.
 */
export function disbursementReasonEn(
  stages: { key: StageKey; completed: boolean; evidenceCount: number }[],
  index: number,
): string {
  const stage = stages[index];
  if (!stage) return "Unknown stage.";
  if (index > 0 && !stages[index - 1].completed) {
    return `The previous stage (${stageName(stages[index - 1].key, "en")}) has not been signed off yet.`;
  }
  if (stage.evidenceCount < 1) {
    return "No evidence has been uploaded for this stage (photos, invoices or an inspection report).";
  }
  if (!stage.completed) return "The stage has not been signed off by the reviewer yet.";
  return "The stage is signed off and its evidence is complete.";
}
