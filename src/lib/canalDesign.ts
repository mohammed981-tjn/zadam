import {
  CROPS,
  waterRequirement,
  IRRIGATION_EFFICIENCY,
  type IrrigationMethod,
} from "@/lib/agronomy";
import {
  ROUTE_CLIMATE,
  ROUTE_LENGTH_KM,
  SCENARIO_CROP_PLAN,
  summarise,
} from "@/lib/arcCanal";

/**
 * تصميم القناة — لا نقلاً عن وثيقة، بل حساباً من الطلب المائي والأرض.
 *
 * The dossier listed the design discharge, the cross-section, the pump staging,
 * the seepage and the power source as unknown. They were unknown in the sense
 * that nobody had published them — not in the sense that they cannot be
 * derived. Every one of them follows from three things this platform already
 * measured: the water the crops need, the ground the canal crosses, and the
 * soil it would be cut into.
 *
 * So this module designs the canal rather than reporting someone else's design.
 * Where a value is a choice rather than a consequence — bed slope, side slope,
 * the width-to-depth ratio, pump efficiency — it is named as a choice, given a
 * standard value, and exported so a reader can change it and watch every number
 * downstream move.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No cost per cubic metre of excavation, and no construction schedule. Those
 * depend on what the machine is actually digging through, and the platform has
 * soil texture at 250 m — which is enough for seepage and for irrigation
 * suitability, and nowhere near enough for a bill of quantities. A number here
 * would look like the rest and be worth much less.
 */

// ─────────────────────────── الاختيارات التصميمية ───────────────────────────

/**
 * Bed slope, metres per metre. Ten centimetres per kilometre.
 *
 * Standard for a large irrigation carrier on flat ground: steep enough that the
 * water moves without silting, flat enough that it does not scour an unlined
 * bed. It is a choice, and it costs 9.4 m of extra lift over ninety-four
 * kilometres — which is why it appears in the head calculation and not only in
 * the cross-section.
 */
export const BED_SLOPE = 0.0001;

/** Side slope, horizontal:vertical. 1.5:1 is the usual cut in cohesive soil. */
export const SIDE_SLOPE = 1.5;

/** Bottom width as a multiple of depth. Two is the common economic ratio. */
export const WIDTH_TO_DEPTH = 2;

/** Manning's n. 0.025 is an unlined earth canal in good condition. */
export const MANNING_N = 0.025;

/** Combined pump and motor efficiency. */
export const PUMP_EFFICIENCY = 0.75;

/**
 * Head each lift station is designed to take.
 *
 * Twenty metres is a single-stage axial or mixed-flow pump's comfortable range
 * at irrigation discharges. Splitting sixty-four metres across stations of that
 * size is what turns one impossible pump house into a few ordinary ones.
 */
export const LIFT_PER_STATION_M = 20;

/**
 * How much longer than the peak the canal is designed to run each day.
 *
 * A canal sized for twenty-four-hour operation is the smallest and the most
 * fragile: any stoppage is unrecoverable demand. Twenty hours leaves four for
 * maintenance and for catching up.
 */
export const OPERATING_HOURS_PER_DAY = 20;

/** Photovoltaic performance ratio — losses between panel rating and meter. */
export const PV_PERFORMANCE_RATIO = 0.78;

// ───────────────────────────── التسرّب بالقوام ─────────────────────────────

/**
 * Seepage through the wetted perimeter, m³ per m² per day, by soil texture.
 *
 * Mid-range values from the standard canal-loss tables (Moritz / USBR). The
 * spread across classes is a factor of four, which is why the soil survey
 * matters more here than anywhere else on this page: the same canal loses
 * either a tenth or nearly half of what enters it depending on what it is cut
 * through.
 */
export const SEEPAGE_RATE: Record<string, number> = {
  clay: 0.09,
  "sandy clay": 0.11,
  "clay loam": 0.13,
  loam: 0.2,
  "sandy clay loam": 0.22,
  "sandy loam": 0.3,
  "loamy sand": 0.38,
  sand: 0.45,
};

/** The Arabic name for each class, so the page does not print English. */
export const TEXTURE_LABEL: Record<string, string> = {
  clay: "طينية",
  "sandy clay": "طينية رملية",
  "clay loam": "طميية طينية",
  loam: "طميية",
  "sandy clay loam": "طميية طينية رملية",
  "sandy loam": "طميية رملية",
  "loamy sand": "رملية طميية",
  sand: "رملية",
};

/**
 * USDA texture class from clay and sand percentages.
 *
 * The boundaries matter here rather than being pedantry. The first version of
 * this function had no sandy-clay-loam class, and the corridor's actual
 * numbers — around 26% clay against 50% sand — fell through to plain loam,
 * which understates seepage by a tenth. The classes the triangle actually
 * defines in this corner of it are the ones that get named.
 */
export function textureClass(clayPct: number, sandPct: number): string {
  if (clayPct >= 40) return sandPct >= 45 ? "sandy clay" : "clay";
  if (clayPct >= 27) return sandPct >= 45 ? "sandy clay loam" : "clay loam";
  if (clayPct >= 20 && sandPct >= 45) return "sandy clay loam";
  if (sandPct >= 85) return "sand";
  if (sandPct >= 70) return "loamy sand";
  if (clayPct < 20 && sandPct >= 52) return "sandy loam";
  return "loam";
}

// ──────────────────────────────── الحساب ────────────────────────────────

export interface CanalDesign {
  areaFeddan: number;
  method: IrrigationMethod;
  lengthKm: number;

  /** Season demand at the field, million m³. */
  annualFieldMm3: number;
  /** Peak-month demand at the field, m³ per day for the whole scheme. */
  peakM3PerDay: number;

  /** What must enter the canal head, m³/s, including seepage and duty hours. */
  designQ: number;

  depthM: number;
  bottomWidthM: number;
  topWidthM: number;
  velocityMS: number;
  /** True when velocity sits in the 0.6–1.5 m/s window an earth canal needs. */
  velocityOk: boolean;

  frictionHeadM: number;
  staticLiftM: number;
  totalHeadM: number;
  stations: number;

  seepageClass: string;
  seepageMm3PerYear: number;
  seepageShare: number;

  /** Everything the pumps must lift, million m³. */
  annualHeadworksMm3: number;
  peakPowerMW: number;
  annualEnergyGWh: number;

  /** Peak solar capacity that would cover the year's pumping, MWp. */
  pvMwp: number | null;

  /** Bulk excavation for the prism, million m³. */
  earthworkMm3: number;
  /** Capital, million $, low and high on the named unit rates. */
  capexLowM: number;
  capexHighM: number;
  /** Annualised capital plus energy, $ per feddan per year. */
  fixedCostPerFeddanLow: number;
  fixedCostPerFeddanHigh: number;
}

// ────────────────────────────── أسعار الوحدة ──────────────────────────────
//
// Three rates, and every capital figure this module produces is one of them
// multiplied by a quantity computed above. They are ranges because they are the
// part nobody measured — but a quantity times a named rate is a different kind
// of number from a lump sum quoted with neither.

/** Bulk earthmoving, $ per m³. Wide, because it depends on the material. */
export const EXCAVATION_USD_PER_M3 = { low: 2, high: 4 };

/** Installed pumping plant, $ per kW — pumps, motors, houses, switchgear. */
export const PUMPING_USD_PER_KW = { low: 700, high: 1000 };

/** Utility-scale photovoltaic, $ per kWp installed. */
export const PV_USD_PER_KWP = { low: 650, high: 900 };

/** Discount rate and horizon for turning capital into an annual charge. */
export const DISCOUNT_RATE = 0.08;
export const ECONOMIC_LIFE_YEARS = 25;

/** Capital recovery factor — what a dollar of capital costs every year. */
export const CAPITAL_RECOVERY_FACTOR =
  (DISCOUNT_RATE * Math.pow(1 + DISCOUNT_RATE, ECONOMIC_LIFE_YEARS)) /
  (Math.pow(1 + DISCOUNT_RATE, ECONOMIC_LIFE_YEARS) - 1);

const M3_PER_FEDDAN_TO_MM3 = 1e-6;

/** Weighted season demand for the study's crop mix, m³ per feddan. */
function planM3PerFeddan(method: IrrigationMethod): number {
  return SCENARIO_CROP_PLAN.reduce(
    (sum, p) =>
      sum +
      waterRequirement(
        CROPS.find((c) => c.key === p.cropKey)!,
        ROUTE_CLIMATE,
        p.plantingMonth,
        method,
      ).m3PerFeddan *
        p.share,
    0,
  );
}

/**
 * Peak daily demand per feddan for the mix.
 *
 * Taken as the largest peak among the crops rather than the weighted mean,
 * because the crops do not peak in the same month and a canal sized for the
 * average of their peaks is undersized in every one of them. This is
 * conservative by design: the alternative sizes the works to a month that never
 * happens.
 */
function planPeakM3PerFeddanPerDay(method: IrrigationMethod): number {
  return Math.max(
    ...SCENARIO_CROP_PLAN.map(
      (p) =>
        waterRequirement(
          CROPS.find((c) => c.key === p.cropKey)!,
          ROUTE_CLIMATE,
          p.plantingMonth,
          method,
        ).peakM3PerFeddanPerDay,
    ),
  );
}

/**
 * Solves Manning's equation for the depth a trapezoidal channel needs.
 *
 * Q = (1/n)·A·R^(2/3)·S^(1/2), with A and R written in terms of depth alone
 * once the width-to-depth and side-slope ratios are fixed. That collapses to
 * Q = C·y^(8/3), which inverts directly — no iteration, and no chance of the
 * solver quietly returning the wrong root.
 */
export function normalDepth(q: number, bedSlope: number = BED_SLOPE): number {
  const k = WIDTH_TO_DEPTH;
  const z = SIDE_SLOPE;
  const shape =
    Math.pow(k + z, 5 / 3) / Math.pow(k + 2 * Math.sqrt(1 + z * z), 2 / 3);
  const c = (shape * Math.sqrt(bedSlope)) / MANNING_N;
  return Math.pow(q / c, 3 / 8);
}

/**
 * Length and lift are parameters, because the scheme and the pilot are not the
 * same canal.
 *
 * Charging a twenty-thousand-feddan pilot for ninety-four kilometres of wetted
 * perimeter is not conservatism, it is the wrong drawing: seepage is a function
 * of length and the pilot does not need the length. The default is the full
 * arc; the pilot passes its own reach and its own near-zero lift, and the
 * difference between the two answers is the argument for building it at the
 * southern end.
 */
export interface CanalReach {
  lengthKm: number;
  staticLiftM: number;
  /**
   * Bed slope for this reach. Optional because it is only worth departing from
   * the default on a small canal: velocity falls with discharge, and a pilot
   * carrying ten cubic metres a second down the standard ten-centimetre grade
   * runs at 0.52 m/s — below the 0.6 an earth channel needs to stay clear of
   * silt. A steeper bed is the ordinary answer, and costs a little more lift.
   */
  bedSlope?: number;
}

export const FULL_ARC: CanalReach = {
  lengthKm: ROUTE_LENGTH_KM,
  staticLiftM: summarise().liftM,
};

/**
 * The first twelve kilometres west of the reservoir, where SRTM puts the ground
 * at 377–394 m against a water surface at 377.
 */
export const PILOT_REACH: CanalReach = {
  lengthKm: 12,
  staticLiftM: 6,
  bedSlope: 0.00035,
};

export function designCanal(
  areaFeddan: number,
  method: IrrigationMethod,
  /** Clay % in the top metre along the route; null falls back to loam. */
  clayPct: number | null,
  sandPct: number | null,
  /** Mean daily irradiance, kWh/m²/day. Null skips the solar sizing. */
  irradiance: number | null,
  reach: CanalReach = FULL_ARC,
): CanalDesign {
  const annualFieldMm3 = planM3PerFeddan(method) * areaFeddan * M3_PER_FEDDAN_TO_MM3;
  const peakM3PerDay = planPeakM3PerFeddanPerDay(method) * areaFeddan;

  const seepageClass =
    clayPct === null || sandPct === null
      ? "loam"
      : textureClass(clayPct, sandPct);
  const rate = SEEPAGE_RATE[seepageClass];

  /*
   * Seepage and discharge determine each other, so this iterates.
   *
   * A wider canal loses more, and losing more requires a wider canal. Three
   * passes from a seepage-free start settle to within a fraction of a percent —
   * the coupling is weak because seepage is a small share of throughput, and a
   * fixed point reached this way is easier to check than a closed form.
   */
  const slope = reach.bedSlope ?? BED_SLOPE;
  let seepageM3PerDay = 0;
  let depth = 0;
  let q = 0;

  for (let pass = 0; pass < 4; pass++) {
    const dailyAtHead = peakM3PerDay + seepageM3PerDay;
    q = dailyAtHead / (OPERATING_HOURS_PER_DAY * 3600);
    depth = normalDepth(q, slope);

    const wettedPerimeter =
      depth * (WIDTH_TO_DEPTH + 2 * Math.sqrt(1 + SIDE_SLOPE * SIDE_SLOPE));
    seepageM3PerDay = rate * wettedPerimeter * reach.lengthKm * 1000;
  }

  const bottomWidthM = WIDTH_TO_DEPTH * depth;
  const topWidthM = bottomWidthM + 2 * SIDE_SLOPE * depth;
  const area = depth * (bottomWidthM + SIDE_SLOPE * depth);
  const velocityMS = q / area;

  // Seepage runs whenever the canal runs. Charging it for the whole season
  // rather than only the peak month is what makes it an honest share.
  const seasonDays = annualFieldMm3 > 0 ? 365 : 0;
  const seepageMm3PerYear = (seepageM3PerDay * seasonDays) / 1e6;
  const annualHeadworksMm3 = annualFieldMm3 + seepageMm3PerYear;

  const frictionHeadM = slope * reach.lengthKm * 1000;
  const staticLiftM = reach.staticLiftM;
  const totalHeadM = staticLiftM + frictionHeadM;
  const stations = Math.ceil(totalHeadM / LIFT_PER_STATION_M);

  // P = ρgQH/η, in watts.
  const peakPowerMW = (1000 * 9.81 * q * totalHeadM) / PUMP_EFFICIENCY / 1e6;
  const annualEnergyGWh =
    (1000 * 9.81 * annualHeadworksMm3 * 1e6 * totalHeadM) /
    PUMP_EFFICIENCY /
    3.6e12;

  const pvMwp =
    irradiance === null || irradiance <= 0
      ? null
      : (annualEnergyGWh * 1e3) / (irradiance * PV_PERFORMANCE_RATIO * 365);

  /*
   * Capital from quantities, not from a quoted total.
   *
   * Excavation is the prism's cross-sectional area over the length — a lower
   * bound, since it counts no spoil haul, no embankment, no structures, no
   * crossings and no lining. Pumping is the peak megawatts at an installed
   * rate. Solar is the array that covers the year's energy; where it is not
   * sized, the pumping still has to be powered by something and the figure
   * simply omits it rather than pretending the electricity is free.
   *
   * Naming it a lower bound matters more than the number: a reader who is told
   * "$414–630 million" learns nothing about what would move it, while "29
   * million cubic metres at $2–4" can be argued with.
   */
  const earthworkMm3 = (area * reach.lengthKm * 1000) / 1e6;

  const excavLow = earthworkMm3 * 1e6 * EXCAVATION_USD_PER_M3.low;
  const excavHigh = earthworkMm3 * 1e6 * EXCAVATION_USD_PER_M3.high;
  const pumpLow = peakPowerMW * 1000 * PUMPING_USD_PER_KW.low;
  const pumpHigh = peakPowerMW * 1000 * PUMPING_USD_PER_KW.high;
  const pvLow = (pvMwp ?? 0) * 1000 * PV_USD_PER_KWP.low;
  const pvHigh = (pvMwp ?? 0) * 1000 * PV_USD_PER_KWP.high;

  const capexLowM = (excavLow + pumpLow + pvLow) / 1e6;
  const capexHighM = (excavHigh + pumpHigh + pvHigh) / 1e6;

  // With the pumping solar-powered the energy is inside the capital, so the
  // annual charge is capital recovery alone. That is the whole reason to size
  // the array: it converts an operating cost nobody can quote into one.
  const fixedCostPerFeddanLow =
    (capexLowM * 1e6 * CAPITAL_RECOVERY_FACTOR) / areaFeddan;
  const fixedCostPerFeddanHigh =
    (capexHighM * 1e6 * CAPITAL_RECOVERY_FACTOR) / areaFeddan;

  return {
    earthworkMm3,
    capexLowM,
    capexHighM,
    fixedCostPerFeddanLow,
    fixedCostPerFeddanHigh,
    areaFeddan,
    method,
    lengthKm: reach.lengthKm,
    annualFieldMm3,
    peakM3PerDay,
    designQ: q,
    depthM: depth,
    bottomWidthM,
    topWidthM,
    velocityMS,
    velocityOk: velocityMS >= 0.6 && velocityMS <= 1.5,
    frictionHeadM,
    staticLiftM,
    totalHeadM,
    stations,
    seepageClass,
    seepageMm3PerYear,
    seepageShare: seepageMm3PerYear / annualHeadworksMm3,
    annualHeadworksMm3,
    peakPowerMW,
    annualEnergyGWh,
    pvMwp,
  };
}

/** Kept exported so the water section and this module cannot disagree. */
export { planM3PerFeddan, planPeakM3PerFeddanPerDay, IRRIGATION_EFFICIENCY };
