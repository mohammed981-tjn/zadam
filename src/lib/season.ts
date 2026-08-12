/**
 * Growing-season planning: stages, water, budget and the disbursement gate.
 *
 * The plan is derived, not typed in. Given a crop and a planting date, the
 * FAO-56 model already knows how long each growth stage runs and how much water
 * it needs, so the season plan falls out of it: real dates, real cubic metres
 * per stage, and a budget split that follows where the work actually happens.
 *
 * This is also where the protection for both sides lives. Money is not handed
 * over in one lump. Each stage carries a share of the budget that is released
 * only after that stage is marked done with evidence on file. The investor
 * risks one stage at a time; the farmer is paid as soon as work is proven
 * rather than after an argument.
 */

import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  cropCoefficient,
  effectiveRainfall,
  referenceEt0,
  M3_PER_MM_PER_FEDDAN,
  type CropCoefficients,
  type IrrigationMethod,
  type StationClimate,
} from "./agronomy";

export type StageKey =
  | "land_prep"
  | "planting"
  | "establishment"
  | "vegetative"
  | "flowering"
  | "maturity"
  | "harvest";

export interface StageTemplate {
  key: StageKey;
  name: string;
  /** What the farmer is expected to do, shown as the stage checklist. */
  activities: string[];
  /** Share of the season budget released when this stage is signed off. */
  budgetShare: number;
}

/**
 * Budget shares follow the real cash profile of a season: land preparation and
 * planting are front-loaded because inputs are bought before anything grows,
 * and harvest carries a meaningful share because labour peaks there.
 */
export const STAGE_TEMPLATES: Record<StageKey, StageTemplate> = {
  land_prep: {
    key: "land_prep",
    name: "تحضير الأرض",
    activities: [
      "الحرث والتسوية",
      "فتح القنوات أو مدّ خطوط الري",
      "إضافة السماد الأساسي",
    ],
    budgetShare: 0.18,
  },
  planting: {
    key: "planting",
    name: "الزراعة",
    activities: [
      "شراء البذور المعتمدة",
      "معاملة البذرة",
      "الزراعة والريّة الأولى",
    ],
    budgetShare: 0.22,
  },
  establishment: {
    key: "establishment",
    name: "الإنبات والتأسيس",
    activities: ["متابعة الإنبات", "الترقيع", "أول مكافحة للحشائش"],
    budgetShare: 0.1,
  },
  vegetative: {
    key: "vegetative",
    name: "النمو الخضري",
    activities: ["التسميد الآزوتي", "الري المنتظم", "مراقبة الآفات"],
    budgetShare: 0.15,
  },
  flowering: {
    key: "flowering",
    name: "التزهير والإثمار",
    activities: [
      "الري في موعده بدقة — أحرج مراحل الإجهاد المائي",
      "التسميد البوتاسي",
      "مكافحة آفات الإزهار",
    ],
    budgetShare: 0.15,
  },
  maturity: {
    key: "maturity",
    name: "النضج",
    activities: [
      "تقليل الري تدريجياً",
      "تجهيز الحصاد",
      "تقدير الإنتاج المتوقع",
    ],
    budgetShare: 0.05,
  },
  harvest: {
    key: "harvest",
    name: "الحصاد وما بعده",
    activities: ["الحصاد", "التجفيف والتنظيف", "التخزين أو التسليم للمشتري"],
    budgetShare: 0.15,
  },
};

export interface PlannedStage {
  key: StageKey;
  name: string;
  activities: string[];
  order: number;
  startDate: string;
  endDate: string;
  days: number;
  /** Irrigation water this stage needs, cubic metres for the whole field. */
  waterM3: number;
  /** Budget released on sign-off, for the whole field. */
  budget: number;
}

export interface SeasonPlan {
  crop: CropCoefficients;
  station: StationClimate;
  irrigation: IrrigationMethod;
  feddans: number;
  plantingDate: string;
  harvestDate: string;
  stages: PlannedStage[];
  totalWaterM3: number;
  totalBudget: number;
}

const DAY_MS = 86_400_000;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MID_MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

/**
 * Irrigation water for one day of the season, in mm of depth, netting off the
 * share of that month's effective rainfall which falls on a single day.
 */
function dailyGrossMm(
  crop: CropCoefficients,
  station: StationClimate,
  date: Date,
  dayInSeason: number,
  efficiency: number,
): number {
  const m = date.getMonth();
  const et0 = referenceEt0(
    station.tmax[m],
    station.tmin[m],
    station.latitude,
    MID_MONTH_DOY[m],
  );
  const etc = et0 * cropCoefficient(crop, dayInSeason);
  const rainPerDay = effectiveRainfall(station.rainfall[m]) / DAYS_IN_MONTH[m];
  return Math.max(0, etc - rainPerDay) / efficiency;
}

/**
 * Builds the full season plan.
 *
 * Land preparation runs before the planting date and harvest after the crop
 * finishes, so the four FAO growth stages sit between them and inherit their
 * real lengths from the crop model rather than a fixed guess.
 */
export function planSeason(
  cropKey: string,
  stationKey: string,
  plantingDate: string,
  irrigation: IrrigationMethod,
  feddans: number,
  budgetPerFeddan: number,
): SeasonPlan | null {
  const crop = CROPS.find((c) => c.key === cropKey);
  const station = STATIONS.find((s) => s.key === stationKey);
  const planting = new Date(`${plantingDate}T00:00:00Z`);

  if (!crop || !station || Number.isNaN(planting.getTime())) return null;
  if (!(feddans > 0) || !(budgetPerFeddan >= 0)) return null;

  const efficiency = IRRIGATION_EFFICIENCY[irrigation];
  const [ini, dev, mid, late] = crop.stages;
  const totalBudget = feddans * budgetPerFeddan;

  // Growth stages sit on the season timeline; the two operational stages
  // bracket it.
  const growth: { key: StageKey; from: number; to: number }[] = [
    { key: "establishment", from: 0, to: ini },
    { key: "vegetative", from: ini, to: ini + dev },
    { key: "flowering", from: ini + dev, to: ini + dev + mid },
    { key: "maturity", from: ini + dev + mid, to: ini + dev + mid + late },
  ];

  const seasonDays = ini + dev + mid + late;
  const LAND_PREP_DAYS = 14;
  const HARVEST_DAYS = 12;

  const stages: PlannedStage[] = [];
  let order = 0;

  const push = (
    key: StageKey,
    startOffset: number,
    days: number,
    waterM3: number,
  ) => {
    const t = STAGE_TEMPLATES[key];
    stages.push({
      key,
      name: t.name,
      activities: t.activities,
      order: order++,
      startDate: iso(addDays(planting, startOffset)),
      endDate: iso(addDays(planting, startOffset + days - 1)),
      days,
      waterM3: Math.round(waterM3),
      budget: Math.round(totalBudget * t.budgetShare),
    });
  };

  // Land preparation, before planting, needs no crop water.
  push("land_prep", -LAND_PREP_DAYS, LAND_PREP_DAYS, 0);

  // Planting overlaps the first days of the season, so its water is counted
  // inside the establishment stage rather than twice.
  push("planting", 0, Math.min(5, ini), 0);

  for (const g of growth) {
    let mm = 0;
    for (let day = g.from; day < g.to; day++) {
      mm += dailyGrossMm(
        crop,
        station,
        addDays(planting, day),
        day,
        efficiency,
      );
    }
    push(g.key, g.from, g.to - g.from, mm * M3_PER_MM_PER_FEDDAN * feddans);
  }

  push("harvest", seasonDays, HARVEST_DAYS, 0);

  stages.sort((a, b) => a.startDate.localeCompare(b.startDate));
  stages.forEach((s, i) => (s.order = i));

  return {
    crop,
    station,
    irrigation,
    feddans,
    plantingDate: iso(planting),
    harvestDate: iso(addDays(planting, seasonDays + HARVEST_DAYS - 1)),
    stages,
    totalWaterM3: stages.reduce((sum, s) => sum + s.waterM3, 0),
    totalBudget: stages.reduce((sum, s) => sum + s.budget, 0),
  };
}

export type LedgerCategory =
  | "seeds"
  | "fertiliser"
  | "pesticide"
  | "labour"
  | "irrigation"
  | "transport"
  | "other"
  | "revenue";

export const LEDGER_LABEL: Record<LedgerCategory, string> = {
  seeds: "بذور",
  fertiliser: "أسمدة",
  pesticide: "مبيدات",
  labour: "عمالة",
  irrigation: "ري ووقود",
  transport: "نقل",
  other: "أخرى",
  revenue: "إيراد",
};

export interface LedgerEntry {
  category: LedgerCategory;
  amount: number;
}

export interface LedgerSummary {
  costs: number;
  revenue: number;
  profit: number;
  profitPerFeddan: number;
  /** Costs broken down by category, largest first. */
  byCategory: { category: LedgerCategory; label: string; amount: number }[];
  /** Costs booked so far against the planned budget, 0–1 and uncapped above. */
  budgetUsed: number;
}

/** Rolls the ledger up into the numbers a farmer and an investor both want. */
export function summariseLedger(
  entries: LedgerEntry[],
  feddans: number,
  plannedBudget: number,
): LedgerSummary {
  let costs = 0;
  let revenue = 0;
  const totals = new Map<LedgerCategory, number>();

  for (const e of entries) {
    if (!Number.isFinite(e.amount)) continue;
    if (e.category === "revenue") {
      revenue += e.amount;
    } else {
      costs += e.amount;
      totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
    }
  }

  const byCategory = [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      label: LEDGER_LABEL[category],
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const profit = revenue - costs;

  return {
    costs,
    revenue,
    profit,
    profitPerFeddan: feddans > 0 ? profit / feddans : 0,
    byCategory,
    budgetUsed: plannedBudget > 0 ? costs / plannedBudget : 0,
  };
}

/**
 * Decides whether a stage's money may be released.
 *
 * Two conditions, both required: the stage before it is signed off, and this
 * stage has evidence attached. Sequence matters — releasing the harvest budget
 * while the crop is still in the ground is exactly the failure this prevents.
 */
export function disbursementDecision(
  stages: { key: StageKey; completed: boolean; evidenceCount: number }[],
  index: number,
): { released: boolean; reason: string } {
  const stage = stages[index];
  if (!stage) return { released: false, reason: "مرحلة غير معروفة." };

  if (index > 0 && !stages[index - 1].completed) {
    return {
      released: false,
      reason: `لم تُعتمد المرحلة السابقة (${STAGE_TEMPLATES[stages[index - 1].key].name}) بعد.`,
    };
  }

  if (stage.evidenceCount < 1) {
    return {
      released: false,
      reason:
        "لا توجد أدلة مرفوعة لهذه المرحلة (صور أو فواتير أو تقرير معاينة).",
    };
  }

  if (!stage.completed) {
    return { released: false, reason: "المرحلة لم تُعتمد من المراجع بعد." };
  }

  return { released: true, reason: "المرحلة معتمدة وأدلتها مكتملة." };
}
