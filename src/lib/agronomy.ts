/**
 * Crop water requirement engine — FAO Irrigation & Drainage Paper 56.
 *
 * Why this matters for sudagri: every claim a project makes about how much land
 * it can irrigate rests on m³ per feddan. The Arc Canal studies we audited got
 * this wrong by a factor of two and nobody could check them, because the number
 * was asserted rather than derived. Here it is derived, from a published
 * international standard, so any farmer or investor can reproduce it.
 *
 * Method: reference evapotranspiration ET0 by Hargreaves–Samani (FAO-56 eq. 52),
 * which needs only min/max temperature and latitude. FAO recommends it exactly
 * where full weather data is missing — which is the situation across Sudan.
 * Crop demand is then ETc = Kc × ET0 using the dual-stage Kc curve of FAO-56
 * Table 12, and the irrigation requirement nets off effective rainfall (USDA-SCS)
 * and divides by the efficiency of the irrigation method.
 */

export type IrrigationMethod = "flood" | "sprinkler" | "pivot" | "drip";

/** Application efficiency — the share of delivered water the crop actually gets. */
export const IRRIGATION_EFFICIENCY: Record<IrrigationMethod, number> = {
  flood: 0.55,
  sprinkler: 0.75,
  pivot: 0.8,
  drip: 0.9,
};

export const IRRIGATION_LABEL: Record<IrrigationMethod, string> = {
  flood: "ري بالغمر",
  sprinkler: "ري بالرش",
  pivot: "محاور ارتكازية",
  drip: "ري بالتنقيط",
};

export interface CropCoefficients {
  key: string;
  name: string;
  /** Stage lengths in days: initial, development, mid-season, late-season. */
  stages: [number, number, number, number];
  /** Kc at the initial, mid-season and late-season stages (FAO-56 Table 12). */
  kcInitial: number;
  kcMid: number;
  kcEnd: number;
}

/** FAO-56 Table 12 values, stage lengths adjusted to Sudanese growing seasons. */
export const CROPS: CropCoefficients[] = [
  {
    key: "wheat",
    name: "قمح",
    stages: [20, 25, 40, 25],
    kcInitial: 0.3,
    kcMid: 1.15,
    kcEnd: 0.3,
  },
  {
    key: "sorghum",
    name: "ذرة رفيعة",
    stages: [20, 35, 40, 30],
    kcInitial: 0.3,
    kcMid: 1.05,
    kcEnd: 0.55,
  },
  {
    key: "maize",
    name: "ذرة شامية",
    stages: [20, 35, 40, 30],
    kcInitial: 0.3,
    kcMid: 1.2,
    kcEnd: 0.6,
  },
  {
    key: "cotton",
    name: "قطن",
    stages: [30, 50, 60, 55],
    kcInitial: 0.35,
    kcMid: 1.18,
    kcEnd: 0.6,
  },
  {
    key: "groundnut",
    name: "فول سوداني",
    stages: [25, 35, 45, 25],
    kcInitial: 0.4,
    kcMid: 1.15,
    kcEnd: 0.6,
  },
  {
    key: "sesame",
    name: "سمسم",
    stages: [20, 30, 40, 20],
    kcInitial: 0.35,
    kcMid: 1.1,
    kcEnd: 0.25,
  },
  {
    key: "alfalfa",
    name: "برسيم",
    stages: [10, 20, 20, 10],
    kcInitial: 0.4,
    kcMid: 1.2,
    kcEnd: 1.15,
  },
  {
    key: "onion",
    name: "بصل",
    stages: [20, 35, 110, 45],
    kcInitial: 0.7,
    kcMid: 1.05,
    kcEnd: 0.75,
  },
  {
    key: "tomato",
    name: "طماطم",
    stages: [30, 40, 45, 30],
    kcInitial: 0.6,
    kcMid: 1.15,
    kcEnd: 0.8,
  },
  {
    key: "sugarcane",
    name: "قصب سكر",
    stages: [50, 70, 220, 40],
    kcInitial: 0.4,
    kcMid: 1.25,
    kcEnd: 0.75,
  },
];

export interface StationClimate {
  key: string;
  name: string;
  latitude: number;
  /** Monthly means, January first. */
  tmax: number[];
  tmin: number[];
  rainfall: number[];
}

/**
 * Long-term monthly normals for the main agricultural zones. These are
 * indicative figures for planning, not measured station records — the tool
 * says so to the user, because the whole point is not to repeat the studies'
 * habit of presenting estimates as measurements.
 */
export const STATIONS: StationClimate[] = [
  {
    key: "khartoum",
    name: "الخرطوم",
    latitude: 15.6,
    tmax: [31, 33, 37, 40, 41, 41, 38, 37, 38, 39, 35, 32],
    tmin: [15, 16, 20, 23, 26, 27, 26, 25, 25, 25, 21, 17],
    rainfall: [0, 0, 0, 0, 4, 5, 35, 50, 25, 5, 0, 0],
  },
  {
    key: "gezira",
    name: "الجزيرة (ود مدني)",
    latitude: 14.4,
    tmax: [33, 35, 38, 41, 41, 39, 35, 33, 35, 38, 36, 34],
    tmin: [15, 16, 19, 23, 25, 25, 24, 23, 23, 23, 19, 16],
    rainfall: [0, 0, 0, 1, 10, 25, 90, 110, 50, 15, 0, 0],
  },
  {
    key: "rivernile",
    name: "نهر النيل (عطبرة)",
    latitude: 17.7,
    tmax: [30, 32, 36, 40, 43, 43, 41, 40, 41, 40, 35, 31],
    tmin: [13, 14, 18, 22, 26, 28, 27, 26, 26, 24, 18, 14],
    rainfall: [0, 0, 0, 0, 1, 3, 15, 25, 8, 1, 0, 0],
  },
  {
    key: "northern",
    name: "الشمالية (دنقلا)",
    latitude: 19.2,
    tmax: [26, 29, 33, 38, 42, 43, 42, 42, 41, 38, 32, 27],
    tmin: [8, 10, 14, 19, 23, 26, 26, 26, 24, 20, 14, 10],
    rainfall: [0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 0, 0],
  },
  {
    key: "kordofan",
    name: "شمال كردفان (الأبيض)",
    latitude: 13.2,
    tmax: [33, 35, 38, 40, 39, 36, 32, 31, 33, 36, 35, 33],
    tmin: [14, 16, 19, 23, 24, 23, 22, 21, 21, 21, 18, 15],
    rainfall: [0, 0, 0, 1, 15, 50, 120, 150, 60, 15, 0, 0],
  },
  {
    key: "kassala",
    name: "كسلا",
    latitude: 15.5,
    tmax: [33, 35, 38, 41, 41, 40, 36, 34, 36, 38, 36, 34],
    tmin: [16, 17, 20, 24, 26, 27, 25, 24, 24, 23, 20, 17],
    rainfall: [0, 0, 0, 1, 8, 25, 90, 110, 35, 8, 0, 0],
  },
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Mid-month day-of-year, used as the representative day for each month. */
const MID_MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/** One feddan is 4,200 m², so 1 mm of depth over a feddan is 4.2 m³. */
export const M3_PER_MM_PER_FEDDAN = 4.2;

/**
 * Extraterrestrial radiation Ra in mm/day equivalent (FAO-56 eq. 21, converted
 * from MJ/m²/day by the 0.408 factor). Pure astronomy — latitude and date only.
 */
export function extraterrestrialRadiation(
  latitudeDeg: number,
  dayOfYear: number,
): number {
  const phi = (Math.PI / 180) * latitudeDeg;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);

  // Clamp guards the poles, where the sun may never rise or never set.
  const cosOmega = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const omega = Math.acos(cosOmega);

  const raMj =
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (omega * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(omega));

  return raMj * 0.408;
}

/** Reference evapotranspiration, Hargreaves–Samani (FAO-56 eq. 52), mm/day. */
export function referenceEt0(
  tmax: number,
  tmin: number,
  latitudeDeg: number,
  dayOfYear: number,
): number {
  const tmean = (tmax + tmin) / 2;
  const range = Math.max(0, tmax - tmin);
  const ra = extraterrestrialRadiation(latitudeDeg, dayOfYear);
  return Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(range) * ra);
}

/** Effective rainfall from monthly total, USDA-SCS method (mm). */
export function effectiveRainfall(monthlyRain: number): number {
  if (monthlyRain <= 0) return 0;
  if (monthlyRain < 250) {
    return Math.max(0, (monthlyRain * (125 - 0.2 * monthlyRain)) / 125);
  }
  return 125 + 0.1 * monthlyRain;
}

/**
 * Kc on a given day of the growing season, following the FAO-56 curve: flat at
 * Kc_ini, linear rise across development, flat at Kc_mid, linear fall to Kc_end.
 */
export function cropCoefficient(
  crop: CropCoefficients,
  dayInSeason: number,
): number {
  const [ini, dev, mid, late] = crop.stages;

  if (dayInSeason < ini) return crop.kcInitial;

  if (dayInSeason < ini + dev) {
    const progress = (dayInSeason - ini) / dev;
    return crop.kcInitial + progress * (crop.kcMid - crop.kcInitial);
  }

  if (dayInSeason < ini + dev + mid) return crop.kcMid;

  const progress = Math.min(1, (dayInSeason - ini - dev - mid) / late);
  return crop.kcMid + progress * (crop.kcEnd - crop.kcMid);
}

export interface MonthlyWater {
  monthIndex: number;
  days: number;
  et0: number;
  etc: number;
  effectiveRain: number;
  netIrrigation: number;
  grossIrrigation: number;
}

export interface WaterRequirement {
  crop: CropCoefficients;
  station: StationClimate;
  method: IrrigationMethod;
  plantingMonth: number;
  seasonDays: number;
  monthly: MonthlyWater[];
  /** Season totals, in mm of depth. */
  totalEtc: number;
  totalEffectiveRain: number;
  totalNet: number;
  totalGross: number;
  /** Season totals per feddan, in cubic metres. */
  m3PerFeddan: number;
  /** Peak month gross demand — this is what sizes the pump, not the average. */
  peakMonthIndex: number;
  peakM3PerFeddanPerDay: number;
}

/**
 * Full seasonal water requirement for one crop at one location.
 *
 * Walks the growing season day by day so the Kc curve is integrated properly
 * rather than approximated per month, then aggregates into calendar months for
 * display and for pump sizing.
 */
export function waterRequirement(
  crop: CropCoefficients,
  station: StationClimate,
  plantingMonth: number,
  method: IrrigationMethod,
): WaterRequirement {
  const seasonDays = crop.stages.reduce((sum, s) => sum + s, 0);
  const efficiency = IRRIGATION_EFFICIENCY[method];

  const etcByMonth = new Array<number>(12).fill(0);
  const et0ByMonth = new Array<number>(12).fill(0);
  const daysByMonth = new Array<number>(12).fill(0);

  let month = plantingMonth;
  let dayOfMonth = 0;

  for (let day = 0; day < seasonDays; day++) {
    if (dayOfMonth >= DAYS_IN_MONTH[month]) {
      month = (month + 1) % 12;
      dayOfMonth = 0;
    }

    const et0 = referenceEt0(
      station.tmax[month],
      station.tmin[month],
      station.latitude,
      MID_MONTH_DOY[month],
    );

    et0ByMonth[month] += et0;
    etcByMonth[month] += et0 * cropCoefficient(crop, day);
    daysByMonth[month] += 1;
    dayOfMonth += 1;
  }

  const monthly: MonthlyWater[] = [];
  let totalEtc = 0;
  let totalEffectiveRain = 0;
  let totalNet = 0;
  let totalGross = 0;

  for (let m = 0; m < 12; m++) {
    if (daysByMonth[m] === 0) continue;

    // Only the share of the month the crop is actually in the ground counts.
    const monthShare = daysByMonth[m] / DAYS_IN_MONTH[m];
    const rain = effectiveRainfall(station.rainfall[m]) * monthShare;
    const etc = etcByMonth[m];
    const net = Math.max(0, etc - rain);
    const gross = net / efficiency;

    monthly.push({
      monthIndex: m,
      days: daysByMonth[m],
      et0: et0ByMonth[m],
      etc,
      effectiveRain: rain,
      netIrrigation: net,
      grossIrrigation: gross,
    });

    totalEtc += etc;
    totalEffectiveRain += rain;
    totalNet += net;
    totalGross += gross;
  }

  // Pumps and canals are sized by the worst month's daily rate, never the mean.
  let peakMonthIndex = monthly[0]?.monthIndex ?? plantingMonth;
  let peakRate = 0;
  for (const m of monthly) {
    const rate = (m.grossIrrigation * M3_PER_MM_PER_FEDDAN) / m.days;
    if (rate > peakRate) {
      peakRate = rate;
      peakMonthIndex = m.monthIndex;
    }
  }

  return {
    crop,
    station,
    method,
    plantingMonth,
    seasonDays,
    monthly,
    totalEtc,
    totalEffectiveRain,
    totalNet,
    totalGross,
    m3PerFeddan: totalGross * M3_PER_MM_PER_FEDDAN,
    peakMonthIndex,
    peakM3PerFeddanPerDay: peakRate,
  };
}

export const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
