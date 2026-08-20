import {
  CROPS,
  M3_PER_MM_PER_FEDDAN,
  waterRequirement,
  type CropCoefficients,
  type IrrigationMethod,
  type StationClimate,
} from "@/lib/agronomy";

/**
 * «الواطة عطشانة» — الجواب الحقيقي: كم يوماً بين ريّة وريّة.
 *
 * WHY THIS MODULE EXISTS, AND WHY NOW
 *
 * Fifty questions have been logged through the assistant. Twenty-six of them —
 * more than half — are one intent asked in Sudanese colloquial: the soil is
 * "thirsty", the water "dries fast in the sand", where is the ground that
 * "holds water". Twenty of those twenty-six went unanswered, because the only
 * path that understood the dialect was the language model, and the model is the
 * part that fails.
 *
 * It is also a question the platform can answer *better* than a model can,
 * which is the test every resolver here has to pass. A model returns advice.
 * The platform can return a number: how many days this crop, on this soil, in
 * this climate, can go between irrigations before the plant runs short.
 *
 * THE PHYSICS, IN ONE LINE
 *
 * Soil holds a fixed depth of water per metre of root zone, and the crop spends
 * it at the daily evapotranspiration rate. Interval = what is safely available
 * ÷ what is used per day. Sand holds a third of what clay loam holds, so the
 * honest answer to "my sand dries out" is not "use more water" — it is "use the
 * same water more often, in smaller doses". That distinction is the whole
 * finding, and it is invisible to anyone reading a seasonal total.
 */

/* ------------------------------------------------------------------ *
 * Total available water, mm per metre of root zone
 * ------------------------------------------------------------------ */

/**
 * FAO-56 Table 19 midpoints.
 *
 * TAW is the water between field capacity and permanent wilting point — the
 * whole reservoir. The spread across textures is a factor of three, and that
 * factor is the entire reason a sandy field feels "thirsty" while its neighbour
 * on clay does not, at identical rainfall and identical irrigation.
 */
export const TAW_MM_PER_M: Record<string, number> = {
  sand: 75,
  "loamy sand": 95,
  "sandy loam": 120,
  loam: 180,
  "silt loam": 200,
  "sandy clay loam": 155,
  "clay loam": 210,
  clay: 200,
};

export const SOIL_LABEL: Record<string, string> = {
  sand: "رملية",
  "loamy sand": "رملية طميية",
  "sandy loam": "طميية رملية",
  loam: "طميية",
  "silt loam": "طميية غرينية",
  "sandy clay loam": "طميية طينية رملية",
  "clay loam": "طميية طينية",
  clay: "طينية",
};

/**
 * Root depth in metres, FAO-56 Table 22, taken at the shallow end of each
 * range.
 *
 * Deliberately the shallow end. The interval this module reports is advice a
 * farmer will act on, and an over-long interval stresses the crop while an
 * over-short one only wastes a little labour. When the table gives a range, the
 * error that costs less is the one to make.
 */
export const ROOT_DEPTH_M: Record<string, number> = {
  wheat: 1.0,
  sorghum: 1.0,
  maize: 0.8,
  millet: 1.0,
  cotton: 1.0,
  groundnut: 0.5,
  sesame: 1.0,
  alfalfa: 1.0,
  onion: 0.3,
  tomato: 0.7,
  sugarcane: 1.2,
  dates: 1.5,
  mango: 1.0,
};

/**
 * Depletion fraction p — the share of the reservoir a crop may use before it
 * starts to suffer. FAO-56 gives it per crop; 0.5 is the standard default and
 * the value most of these crops carry.
 */
export const DEPLETION_FRACTION = 0.5;

/** Shallow-rooted vegetables run dry sooner and get a stricter fraction. */
const SHALLOW_P: Record<string, number> = { onion: 0.3, tomato: 0.4 };

export interface IrrigationInterval {
  soil: string;
  /** Readily available water in the root zone, mm. */
  rawMm: number;
  /** Peak daily crop water use, mm/day. */
  peakMmPerDay: number;
  /** Days between irrigations at peak demand. */
  days: number;
  /** Depth to apply each time, mm, and the same in m³ per feddan. */
  doseMm: number;
  doseM3PerFeddan: number;
}

/**
 * How long this crop can wait on this soil, at the peak of its season.
 *
 * Peak rather than average on purpose: an interval computed on the seasonal
 * mean is comfortably wrong in exactly the month the crop cannot afford it.
 */
export function irrigationInterval(
  crop: CropCoefficients,
  station: StationClimate,
  plantingMonth: number,
  method: IrrigationMethod,
  soil: string,
): IrrigationInterval | null {
  const taw = TAW_MM_PER_M[soil];
  const rootDepth = ROOT_DEPTH_M[crop.key];
  if (taw === undefined || rootDepth === undefined) return null;

  const p = SHALLOW_P[crop.key] ?? DEPLETION_FRACTION;
  const rawMm = taw * rootDepth * p;

  const req = waterRequirement(crop, station, plantingMonth, method);
  // peakM3PerFeddanPerDay is gross — what leaves the pump. Back out the depth
  // the plant actually sees so the interval is not shortened by the delivery
  // system's own losses.
  const peakMmPerDay = req.peakM3PerFeddanPerDay / M3_PER_MM_PER_FEDDAN;
  if (peakMmPerDay <= 0) return null;

  const days = rawMm / peakMmPerDay;

  return {
    soil,
    rawMm,
    peakMmPerDay,
    days,
    doseMm: rawMm,
    doseM3PerFeddan: rawMm * M3_PER_MM_PER_FEDDAN,
  };
}

/** The crop used when a visitor names none — the country's staple. */
export const DEFAULT_CROP =
  CROPS.find((c) => c.key === "sorghum") ?? CROPS[0];
