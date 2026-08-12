/**
 * Project due-diligence scoring and honest return bands.
 *
 * Modelled on how the established farmland platforms actually work. AcreTrader
 * accepts roughly 5% of what it reviews and FarmTogether about 0.4%, both by
 * running every deal through a structured multi-point checklist rather than a
 * judgement call — selectivity is the product. The smallholder-finance scorers
 * (Apollo Agriculture, FarmDrive, FAO's TARA) add the second idea used here:
 * score by location, season and crop from data the platform already holds,
 * instead of asking the applicant to assert that they are low risk.
 *
 * Two rules shape this implementation:
 *
 * 1. Every factor returns its reasoning. A score a farmer cannot contest is a
 *    score they cannot fix, and an investor cannot audit.
 * 2. Water adequacy is computed, not declared — the FAO-56 engine works out
 *    what the crop actually needs and compares it against the water the project
 *    claims to have. That single check is what the Arc Canal studies lacked.
 */

import {
  CROPS,
  STATIONS,
  waterRequirement,
  type IrrigationMethod,
  type CropCoefficients,
  type StationClimate,
} from "./agronomy";
import type { RiskLevel } from "@/types/database";

export type WaterSource = "canal" | "river_pump" | "borehole" | "rainfed";

export const WATER_SOURCE_LABEL: Record<WaterSource, string> = {
  canal: "قناة من خزان أو نهر",
  river_pump: "ضخ مباشر من النهر",
  borehole: "آبار جوفية",
  rainfed: "مطري بالكامل",
};

/**
 * Reliability of each source through a full season, judged on how it behaves in
 * the dry months rather than at peak. Canal supply off a regulated reservoir is
 * the most dependable; rainfed carries the entire season on one rainy spell.
 */
const WATER_SOURCE_RELIABILITY: Record<WaterSource, number> = {
  canal: 1.0,
  river_pump: 0.85,
  borehole: 0.7,
  rainfed: 0.35,
};

export interface CropEconomics {
  key: string;
  /** Tonnes per feddan under competent irrigated management. */
  yieldPerFeddan: number;
  /** Farmgate price, USD per tonne. */
  pricePerTonne: number;
  /** Direct production cost, USD per feddan. */
  costPerFeddan: number;
  /** Coefficient of variation of yield — season-to-season spread. */
  yieldCv: number;
  /** Coefficient of variation of farmgate price. */
  priceCv: number;
}

/**
 * Indicative Sudanese farm economics. Deliberately conservative: the audited
 * studies assumed $3,000–5,000 per feddan of gross revenue, which is four to
 * six times what irrigated grain in Sudan actually returns.
 */
export const CROP_ECONOMICS: Record<string, CropEconomics> = {
  wheat: {
    key: "wheat",
    yieldPerFeddan: 1.05,
    pricePerTonne: 350,
    costPerFeddan: 210,
    yieldCv: 0.22,
    priceCv: 0.2,
  },
  sorghum: {
    key: "sorghum",
    yieldPerFeddan: 1.68,
    pricePerTonne: 250,
    costPerFeddan: 230,
    yieldCv: 0.28,
    priceCv: 0.3,
  },
  maize: {
    key: "maize",
    yieldPerFeddan: 1.9,
    pricePerTonne: 260,
    costPerFeddan: 280,
    yieldCv: 0.26,
    priceCv: 0.28,
  },
  cotton: {
    key: "cotton",
    yieldPerFeddan: 1.05,
    pricePerTonne: 600,
    costPerFeddan: 380,
    yieldCv: 0.25,
    priceCv: 0.32,
  },
  groundnut: {
    key: "groundnut",
    yieldPerFeddan: 0.84,
    pricePerTonne: 700,
    costPerFeddan: 330,
    yieldCv: 0.3,
    priceCv: 0.28,
  },
  sesame: {
    key: "sesame",
    yieldPerFeddan: 0.34,
    pricePerTonne: 1200,
    costPerFeddan: 200,
    yieldCv: 0.35,
    priceCv: 0.3,
  },
  alfalfa: {
    key: "alfalfa",
    yieldPerFeddan: 8.4,
    pricePerTonne: 150,
    costPerFeddan: 520,
    yieldCv: 0.18,
    priceCv: 0.22,
  },
  onion: {
    key: "onion",
    yieldPerFeddan: 12.6,
    pricePerTonne: 180,
    costPerFeddan: 900,
    yieldCv: 0.3,
    priceCv: 0.45,
  },
  tomato: {
    key: "tomato",
    yieldPerFeddan: 14.7,
    pricePerTonne: 200,
    costPerFeddan: 1100,
    yieldCv: 0.32,
    priceCv: 0.5,
  },
  sugarcane: {
    key: "sugarcane",
    yieldPerFeddan: 33.6,
    pricePerTonne: 40,
    costPerFeddan: 700,
    yieldCv: 0.15,
    priceCv: 0.18,
  },
};

export interface ProjectFacts {
  cropKey: string;
  stationKey: string;
  plantingMonth: number;
  irrigation: IrrigationMethod;
  waterSource: WaterSource;
  /** Water the project can actually command, m³ per feddan per season. */
  declaredWaterPerFeddan: number;
  /** Land title, lease, permits, inspection — how many of the required documents are on file. */
  documentsOnFile: number;
  documentsRequired: number;
  /** Completed seasons this operator has delivered on the platform. */
  operatorSeasons: number;
  /** Share of promised field reports the operator actually filed, 0–1. */
  operatorReportingRate: number;
  /** Kilometres to the nearest all-season market road. */
  kmToMarket: number;
}

export interface ScoredFactor {
  key: string;
  label: string;
  weight: number;
  /** 0–1 before weighting. */
  score: number;
  detail: string;
}

export interface RiskAssessment {
  /** 0–100, higher is safer. */
  score: number;
  level: RiskLevel;
  factors: ScoredFactor[];
  /** Issues severe enough that the project must not be published at all. */
  blockers: string[];
  waterNeededPerFeddan: number;
  waterCoverage: number;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lookup(facts: ProjectFacts): {
  crop: CropCoefficients;
  station: StationClimate;
} | null {
  const crop = CROPS.find((c) => c.key === facts.cropKey);
  const station = STATIONS.find((s) => s.key === facts.stationKey);
  return crop && station ? { crop, station } : null;
}

/**
 * Scores a project across six weighted factors and reports why each scored what
 * it did. Weights sum to 100 so the result reads directly as a percentage.
 */
export function assessProject(facts: ProjectFacts): RiskAssessment {
  const found = lookup(facts);
  const blockers: string[] = [];

  if (!found) {
    return {
      score: 0,
      level: "high",
      factors: [],
      blockers: ["المحصول أو الموقع غير معروف للنظام."],
      waterNeededPerFeddan: 0,
      waterCoverage: 0,
    };
  }

  const { crop, station } = found;
  const need = waterRequirement(
    crop,
    station,
    facts.plantingMonth,
    facts.irrigation,
  );
  const waterNeeded = need.m3PerFeddan;
  const coverage =
    waterNeeded > 0 ? facts.declaredWaterPerFeddan / waterNeeded : 0;

  const factors: ScoredFactor[] = [];

  // 1. Water adequacy — computed from FAO-56, not taken on trust.
  const adequacy = clamp01((coverage - 0.6) / 0.45);
  factors.push({
    key: "water_adequacy",
    label: "كفاية المياه",
    weight: 25,
    score: adequacy,
    detail:
      `المحصول يحتاج ${Math.round(waterNeeded).toLocaleString("en-US")} م³/فدان ` +
      `والمشروع يوفّر ${Math.round(facts.declaredWaterPerFeddan).toLocaleString("en-US")} م³ ` +
      `(تغطية ${Math.round(coverage * 100)}%).`,
  });
  if (coverage < 0.7) {
    blockers.push(
      `المياه المتاحة لا تغطي إلا ${Math.round(coverage * 100)}% من احتياج المحصول — المشروع غير قابل للتنفيذ بهذه الأرقام.`,
    );
  }

  // 2. Reliability of the source itself, separate from the quantity.
  const reliability = WATER_SOURCE_RELIABILITY[facts.waterSource];
  factors.push({
    key: "water_source",
    label: "موثوقية مصدر المياه",
    weight: 15,
    score: reliability,
    detail: `${WATER_SOURCE_LABEL[facts.waterSource]} — موثوقية ${Math.round(reliability * 100)}% عبر الموسم.`,
  });

  // 3. Documentation. This is the factor that keeps invented projects out.
  const docRatio =
    facts.documentsRequired > 0
      ? clamp01(facts.documentsOnFile / facts.documentsRequired)
      : 0;
  factors.push({
    key: "documents",
    label: "اكتمال التوثيق",
    weight: 20,
    score: docRatio,
    detail: `${facts.documentsOnFile} من ${facts.documentsRequired} مستنداً مطلوباً مرفوعة ومعتمدة.`,
  });
  if (docRatio < 1) {
    blockers.push(
      `التوثيق ناقص (${facts.documentsOnFile}/${facts.documentsRequired}) — لا يُنشر مشروع قبل اكتمال مستنداته.`,
    );
  }

  // 4. Operator track record: delivered seasons, then reporting discipline.
  const seasonScore = clamp01(facts.operatorSeasons / 3);
  const trackRecord =
    0.6 * seasonScore + 0.4 * clamp01(facts.operatorReportingRate);
  factors.push({
    key: "operator",
    label: "سجل المنفّذ",
    weight: 20,
    score: trackRecord,
    detail:
      facts.operatorSeasons === 0
        ? "منفّذ جديد بلا مواسم سابقة على المنصة."
        : `${facts.operatorSeasons} موسماً منجزاً، والتزام بالتقارير ${Math.round(facts.operatorReportingRate * 100)}%.`,
  });

  // 5. Price exposure, from the crop's own historical volatility.
  const econ = CROP_ECONOMICS[facts.cropKey];
  const priceStability = econ ? clamp01(1 - econ.priceCv / 0.5) : 0.5;
  factors.push({
    key: "price",
    label: "استقرار السعر",
    weight: 12,
    score: priceStability,
    detail: econ
      ? `تذبذب سعر ${crop.name} التاريخي ${Math.round(econ.priceCv * 100)}%.`
      : "لا توجد بيانات سعرية لهذا المحصول.",
  });

  // 6. Market access — a good harvest that cannot reach a buyer is not income.
  const access = clamp01(1 - facts.kmToMarket / 120);
  factors.push({
    key: "access",
    label: "الوصول للسوق",
    weight: 8,
    score: access,
    detail: `${facts.kmToMarket} كم إلى أقرب طريق سوق صالح طوال العام.`,
  });

  const score = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
  const level: RiskLevel =
    score >= 75 ? "low" : score >= 55 ? "medium" : "high";

  return {
    score: Math.round(score * 10) / 10,
    level,
    factors,
    blockers,
    waterNeededPerFeddan: waterNeeded,
    waterCoverage: coverage,
  };
}

export interface ReturnBand {
  /** Net profit per feddan, USD, at the 10th, 50th and 90th percentile. */
  p10: number;
  p50: number;
  p90: number;
  /** The same as a return on the invested cost, as a percentage. */
  p10Pct: number;
  p50Pct: number;
  p90Pct: number;
  /** Probability the season ends at or below break-even. */
  lossProbability: number;
}

/** Standard normal quantile — Acklam's rational approximation, ~1e-9 accurate. */
function normalQuantile(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** Normal CDF via the error function, used for the probability of loss. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Return band for one feddan of a crop.
 *
 * Yield and price are each treated as lognormal — the standard choice for
 * quantities that cannot go negative and have a long upper tail — and revenue
 * is their product, which is lognormal again with the variances adding in log
 * space. Cost is deducted as a fixed amount.
 *
 * A single "expected annual return" figure hides exactly the information an
 * investor needs, so this returns the spread and the odds of a losing season.
 */
export function returnBand(
  cropKey: string,
  waterCoverage = 1,
): ReturnBand | null {
  const econ = CROP_ECONOMICS[cropKey];
  if (!econ) return null;

  // Below full water supply, yield falls roughly in step and gets less certain.
  const stress = Math.max(0, Math.min(1, waterCoverage));
  const meanRevenue = econ.yieldPerFeddan * econ.pricePerTonne * stress;
  const yieldCv = econ.yieldCv * (stress > 0 ? 1 / stress : 3);

  const sigmaSquared =
    Math.log(1 + yieldCv * yieldCv) + Math.log(1 + econ.priceCv * econ.priceCv);
  const sigma = Math.sqrt(sigmaSquared);
  const mu = Math.log(Math.max(1e-9, meanRevenue)) - sigmaSquared / 2;

  const revenueAt = (p: number) => Math.exp(mu + sigma * normalQuantile(p));
  const net = (p: number) => revenueAt(p) - econ.costPerFeddan;
  const pct = (v: number) => (v / econ.costPerFeddan) * 100;

  // P(revenue < cost) with revenue lognormal.
  const lossProbability = normalCdf(
    (Math.log(Math.max(1e-9, econ.costPerFeddan)) - mu) / sigma,
  );

  return {
    p10: net(0.1),
    p50: net(0.5),
    p90: net(0.9),
    p10Pct: pct(net(0.1)),
    p50Pct: pct(net(0.5)),
    p90Pct: pct(net(0.9)),
    lossProbability,
  };
}
