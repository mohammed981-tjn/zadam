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
  {
    // FAO-56 Table 11 gives millet 15/25/40/25 = 105 days, sown in June, and
    // Table 12 gives Kc_mid 1.00, Kc_end 0.30 against the 0.30 initial shared
    // by the cereals group. Read off the published tables, not recalled.
    key: "millet",
    name: "دخن",
    stages: [15, 25, 40, 25],
    kcInitial: 0.3,
    kcMid: 1.0,
    kcEnd: 0.3,
  },
  {
    // FAO-56 Table 12, "Date Palms": 0.90 / 0.95 / 0.95, mature height 8 m.
    //
    // The stage split below is a convention and not an FAO figure — Table 11
    // has no stage lengths for a perennial, because a date palm has no
    // planting date. It sums to a full year, and the near-flat Kc curve means
    // the split barely moves the answer; it exists so a perennial can be
    // costed by the same engine as an annual.
    key: "dates",
    name: "نخيل (تمور)",
    stages: [90, 60, 120, 95],
    kcInitial: 0.9,
    kcMid: 0.95,
    kcEnd: 0.95,
  },
  // MANGO AND GUM ARABIC ARE MISSING ON PURPOSE.
  //
  // Both are discussed in the platform's knowledge base and both were asked
  // for. Neither is in FAO-56 Table 12 — checked against the published table
  // itself, not from memory, and the table has no Mango, no Acacia and no gum
  // of any kind. A coefficient invented for them would be indistinguishable to
  // a reader from the two above, which are sourced, and this file opens by
  // objecting to exactly that. Gum arabic has a second problem: in the gum
  // belt it is rain-fed, so an irrigation requirement answers a question
  // nobody is asking of it.
];

/** Where a station's numbers came from. Surfaced to the user; provenance is the point. */
export type StationSource = "indicative" | "nasa-power";

export const STATION_SOURCE_LABEL: Record<StationSource, string> = {
  indicative: "تقديرية إرشادية",
  "nasa-power": "NASA POWER — MERRA-2، مناخ ٢٠٠١–٢٠٢٠",
};

export interface StationClimate {
  key: string;
  name: string;
  latitude: number;
  /** Kept so the query that produced a nasa-power station can be re-run. */
  longitude: number;
  source: StationSource;
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
 *
 * THE NINE NEW ONES, AND WHY THEY CARRY A DIFFERENT LABEL
 *
 * Six stations covered neither Darfur nor the Blue Nile — two of the country's
 * most important producing regions — so the water calculator could not be
 * pointed at them at all. The nine added here cover all five Darfur states,
 * two points on the Blue Nile, Sennar and the White Nile, and come from the
 * NASA POWER climatology API (MERRA-2, January 2001 – December 2020), derived
 * as Tmax = T2M + T2M_RANGE/2 and Tmin = T2M − T2M_RANGE/2.
 *
 * That derivation is not incidental. POWER also publishes T2M_MAX and T2M_MIN,
 * and they are the wrong numbers: at every aggregation they are the month's
 * *extreme*, not the mean of the daily maxima. Taken at face value they give
 * El Fasher a January minimum of 4 °C and Kosti an April maximum of 47 °C, and
 * because Hargreaves–Samani scales ET0 with the square root of (Tmax − Tmin),
 * that would have inflated every irrigation figure in Darfur.
 *
 * The derivation was checked before it was trusted. Re-running it for Khartoum
 * and Wad Medani — stations already in this list, entered by hand — reproduced
 * them to within 1–2 °C. Nyala and El Fasher then matched published station
 * normals independently: El Fasher's annual span of 11–39 °C and Nyala's mean
 * highs of 31–39 °C, both exactly.
 *
 * TWO STATIONS ARE DELIBERATELY ABSENT: Gedaref and Port Sudan. MERRA-2 gives
 * the Gedaref cell a mean diurnal range near 9 °C in January where the observed
 * figure is roughly 18 °C — a reanalysis smoothing artefact by the Ethiopian
 * escarpment. Halving the range takes about a third off ET0, and understating
 * irrigation demand in Sudan's main rain-fed sorghum belt is worse than
 * admitting the gap. Port Sudan is understated the same way, less severely.
 * Both wait for station data rather than shipping a plausible-looking number.
 */
export const STATIONS: StationClimate[] = [
  {
    key: "khartoum",
    name: "الخرطوم",
    latitude: 15.6,
    longitude: 32.53,
    source: "indicative",
    tmax: [31, 33, 37, 40, 41, 41, 38, 37, 38, 39, 35, 32],
    tmin: [15, 16, 20, 23, 26, 27, 26, 25, 25, 25, 21, 17],
    rainfall: [0, 0, 0, 0, 4, 5, 35, 50, 25, 5, 0, 0],
  },
  {
    key: "gezira",
    name: "الجزيرة (ود مدني)",
    latitude: 14.4,
    longitude: 33.52,
    source: "indicative",
    tmax: [33, 35, 38, 41, 41, 39, 35, 33, 35, 38, 36, 34],
    tmin: [15, 16, 19, 23, 25, 25, 24, 23, 23, 23, 19, 16],
    rainfall: [0, 0, 0, 1, 10, 25, 90, 110, 50, 15, 0, 0],
  },
  {
    key: "rivernile",
    name: "نهر النيل (عطبرة)",
    latitude: 17.7,
    longitude: 33.98,
    source: "indicative",
    tmax: [30, 32, 36, 40, 43, 43, 41, 40, 41, 40, 35, 31],
    tmin: [13, 14, 18, 22, 26, 28, 27, 26, 26, 24, 18, 14],
    rainfall: [0, 0, 0, 0, 1, 3, 15, 25, 8, 1, 0, 0],
  },
  {
    key: "northern",
    name: "الشمالية (دنقلا)",
    latitude: 19.2,
    longitude: 30.48,
    source: "indicative",
    tmax: [26, 29, 33, 38, 42, 43, 42, 42, 41, 38, 32, 27],
    tmin: [8, 10, 14, 19, 23, 26, 26, 26, 24, 20, 14, 10],
    rainfall: [0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 0, 0],
  },
  {
    key: "kordofan",
    name: "شمال كردفان (الأبيض)",
    latitude: 13.2,
    longitude: 30.22,
    source: "indicative",
    tmax: [33, 35, 38, 40, 39, 36, 32, 31, 33, 36, 35, 33],
    tmin: [14, 16, 19, 23, 24, 23, 22, 21, 21, 21, 18, 15],
    rainfall: [0, 0, 0, 1, 15, 50, 120, 150, 60, 15, 0, 0],
  },
  {
    key: "kassala",
    name: "كسلا",
    latitude: 15.5,
    longitude: 36.4,
    source: "indicative",
    tmax: [33, 35, 38, 41, 41, 40, 36, 34, 36, 38, 36, 34],
    tmin: [16, 17, 20, 24, 26, 27, 25, 24, 24, 23, 20, 17],
    rainfall: [0, 0, 0, 1, 8, 25, 90, 110, 35, 8, 0, 0],
  },
  {
    key: "nyala",
    name: "جنوب دارفور (نيالا)",
    latitude: 12.05,
    longitude: 24.88,
    source: "nasa-power",
    tmax: [31, 35, 37, 39, 39, 37, 33, 31, 33, 35, 34, 31],
    tmin: [14, 17, 20, 22, 25, 25, 23, 22, 22, 21, 17, 14],
    rainfall: [0, 0, 0, 1, 13, 34, 131, 148, 79, 23, 0, 0],
  },
  {
    key: "elfasher",
    name: "شمال دارفور (الفاشر)",
    latitude: 13.63,
    longitude: 25.35,
    source: "nasa-power",
    tmax: [29, 32, 35, 38, 39, 38, 36, 34, 35, 35, 32, 29],
    tmin: [11, 14, 17, 20, 23, 25, 24, 22, 22, 20, 15, 11],
    rainfall: [0, 0, 0, 0, 9, 13, 66, 103, 35, 8, 0, 0],
  },
  {
    key: "damazin",
    name: "النيل الأزرق (الدمازين)",
    latitude: 11.78,
    longitude: 34.35,
    source: "nasa-power",
    tmax: [35, 38, 39, 40, 37, 34, 31, 30, 32, 34, 36, 35],
    tmin: [19, 21, 23, 26, 26, 25, 23, 23, 23, 24, 22, 19],
    rainfall: [0, 0, 1, 5, 49, 68, 122, 162, 104, 79, 4, 1],
  },
  {
    key: "kosti",
    name: "النيل الأبيض (كوستي)",
    latitude: 13.17,
    longitude: 32.66,
    source: "nasa-power",
    tmax: [34, 37, 39, 42, 41, 38, 34, 32, 34, 37, 37, 34],
    tmin: [16, 19, 21, 24, 27, 26, 25, 24, 24, 24, 20, 17],
    rainfall: [0, 0, 0, 2, 25, 41, 117, 130, 66, 27, 1, 1],
  },
  {
    key: "geneina",
    name: "غرب دارفور (الجنينة)",
    latitude: 13.45,
    longitude: 22.45,
    source: "nasa-power",
    tmax: [31, 34, 37, 38, 39, 37, 32, 29, 31, 33, 32, 31],
    tmin: [11, 14, 18, 21, 23, 23, 21, 20, 19, 18, 14, 11],
    rainfall: [0, 0, 0, 1, 13, 34, 136, 224, 71, 15, 0, 0],
  },
  {
    key: "zalingei",
    name: "وسط دارفور (زالنجي)",
    latitude: 12.9,
    longitude: 23.48,
    source: "nasa-power",
    tmax: [32, 34, 36, 37, 37, 35, 30, 28, 31, 33, 32, 31],
    tmin: [13, 16, 19, 21, 23, 22, 20, 19, 19, 18, 16, 14],
    rainfall: [0, 0, 0, 1, 14, 36, 179, 237, 69, 20, 0, 0],
  },
  {
    key: "eddaein",
    name: "شرق دارفور (الضعين)",
    latitude: 11.46,
    longitude: 26.13,
    source: "nasa-power",
    tmax: [32, 36, 38, 40, 40, 37, 34, 32, 33, 36, 35, 32],
    tmin: [14, 17, 20, 23, 26, 26, 24, 22, 22, 21, 18, 15],
    rainfall: [0, 0, 0, 1, 18, 46, 120, 162, 93, 29, 0, 0],
  },
  {
    // The wettest point in the list by a wide margin — 918 mm against Dongola's
    // five. It is in for that reason: a tool whose driest station is the whole
    // of the north and whose wettest is Ed Damazin cannot show a Sudanese user
    // how much the answer moves with rain.
    key: "kurmuk",
    name: "النيل الأزرق (الكرمك)",
    latitude: 10.55,
    longitude: 34.28,
    source: "nasa-power",
    tmax: [34, 37, 38, 37, 33, 29, 27, 26, 28, 30, 32, 33],
    tmin: [17, 20, 21, 23, 22, 20, 19, 19, 19, 20, 19, 17],
    rainfall: [0, 1, 3, 16, 107, 148, 185, 169, 150, 126, 9, 3],
  },
  {
    key: "sennar",
    name: "سنار",
    latitude: 13.55,
    longitude: 33.62,
    source: "nasa-power",
    tmax: [33, 36, 38, 40, 38, 35, 32, 30, 32, 35, 36, 34],
    tmin: [18, 20, 22, 25, 27, 27, 25, 24, 24, 25, 22, 19],
    rainfall: [0, 0, 0, 2, 27, 50, 136, 149, 69, 29, 1, 0],
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
