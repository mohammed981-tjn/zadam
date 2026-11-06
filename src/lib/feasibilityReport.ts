/**
 * دراسة الجدوى في تطبيق الهاتف (البند ٢٠٣): الحساب نفسه الذي يجريه الموقع، على الخادم، فلا يختلف رقمان.
 *
 * WHY THIS FILE EXISTS
 *
 * On the website the study is computed in the browser by `FeasibilityStudy.tsx`, which calls `phasedFeasibility`,
 * `irrigationAdvice`, `estimateCostPerFeddan` and `summariseRisks` from src/lib. The phone app does not carry a copy of
 * those functions in Dart (only the FAO-56 water engine is mirrored, for use with no signal), so it asks
 * /api/app/feasibility, and that route answers with this function — the same calls, on the same inputs, cleaned the
 * same way the component cleans them (a non-positive area counts as one feddan, a negative cost as zero, a typed
 * price overrides the reference). `scripts/verify-app-feasibility-library.ts` holds the two to each other.
 *
 * The published per-feddan costs (`publishedCostsFor`, item 177) come back as written — figure, basis, season, place,
 * source — and only where the website shows them: for a crop with no published input list. They never enter a sum.
 */

import {
  ALL_CROPS,
  CROPS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  NEW_CROPS,
  STATIONS,
  STATION_SOURCE_LABEL,
  type IrrigationMethod,
} from "./agronomy";
import { PRICE_BASIS_LABEL, PRICE_BASIS_NOTE, type CropMarket } from "./cropBenchmark";
import { CROP_INPUTS } from "./cropInputs";
import { phasedFeasibility, PHASE_VERDICT_LABEL } from "./feasibility";
import { FARM_RISKS, defaultSettings, summariseRisks, type RiskKey, type RiskSetting } from "./farmRisks";
import { INPUT_PRICES, LOCAL_REFERENCES, estimateCostPerFeddan } from "./inputPrices";
import { irrigationAdvice, PIVOT_MIN_FEDDANS } from "./irrigationAdvice";
import { LOCUST_ALERT_KM, LOCUST_HUB_URL, isGregarious, locustDay, locustLabel, type LocustSummary } from "./locust";
import { NEW_CROP_INFO } from "./newCrops";
import { publishedCostsFor } from "./publishedCropCosts";
import { SERVICE_BY_KEY } from "./services";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];

/** The website's opening values (FeasibilityStudy.tsx's useState defaults). */
export const STUDY_DEFAULTS = {
  crop: "sorghum",
  station: "gezira",
  plantingMonth: 5,
  method: "flood" as IrrigationMethod,
  feddans: 50,
  costPerFeddan: 120,
  waterTariff: 0,
} as const;

export interface StudyRequest {
  crop?: unknown;
  station?: unknown;
  plantingMonth?: unknown;
  method?: unknown;
  feddans?: unknown;
  costPerFeddan?: unknown;
  waterTariff?: unknown;
  /** As typed: an empty string means «use the reference». */
  manualPrice?: unknown;
  sprays?: unknown;
  sprayUsd?: unknown;
  risks?: unknown;
}

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** What the phone may choose from, with the website's defaults. */
export function feasibilityOptions() {
  return {
    defaults: STUDY_DEFAULTS,
    crops: [
      ...CROPS.map((c) => ({ key: c.key, name: c.name, group: "sudan" as const, hasInputs: !!CROP_INPUTS[c.key] })),
      ...NEW_CROPS.map((c) => ({ key: c.key, name: c.name, group: "new" as const, hasInputs: !!CROP_INPUTS[c.key] })),
    ],
    stations: STATIONS.map((s) => ({ key: s.key, name: s.name })),
    months: MONTH_NAMES,
    methods: METHODS.map((m) => ({ key: m, label: IRRIGATION_LABEL[m] })),
    risks: FARM_RISKS.map((r) => ({
      key: r.key,
      name: r.name.ar,
      reserve: r.reserveUsd !== null,
      basis: r.basis?.ar ?? null,
      treatment: r.treatment.ar,
      services: r.services.map((k) => SERVICE_BY_KEY[k].name),
      sources: r.sources,
    })),
    riskDefaults: defaultSettings(),
    newCrops: NEW_CROP_INFO.map((c) => ({
      key: c.key,
      name: c.ar,
      inStudy: c.inStudy,
      evidence: c.evidence.ar,
      caution: c.caution?.ar ?? null,
      sources: c.sources,
    })),
  };
}

/** The farmer's risk settings as sent, kept to the known risks and in their order; the defaults for anything missing. */
export function riskSettingsFrom(raw: unknown): RiskSetting[] {
  const sent = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return defaultSettings().map((d) => {
    const s = sent.find((x) => x && typeof x === "object" && x.key === d.key);
    if (!s) return d;
    return {
      key: d.key as RiskKey,
      applies: s.applies === undefined ? d.applies : s.applies === true,
      everyYears: s.everyYears === undefined ? d.everyYears : numOrNull(s.everyYears),
      lossPct: s.lossPct === undefined ? d.lossPct : numOrNull(s.lossPct),
      reserveUsd: s.reserveUsd === undefined ? d.reserveUsd : numOrNull(s.reserveUsd),
    };
  });
}

export interface ReportContext {
  /** loadCropMarkets(): null when the reference could not be read at all. */
  markets: Record<string, CropMarket> | null;
  /** Pounds per dollar, Bank of Khartoum and the parallel market (currentFx()). */
  sdgPerUsd: number | null;
  sdgPerUsdParallel: number | null;
  locust: LocustSummary | null;
}

/** The whole study, as the website's page shows it, for one set of inputs. Null only if the study itself refuses. */
export function feasibilityReport(req: StudyRequest, ctx: ReportContext) {
  const cropKey = typeof req.crop === "string" && ALL_CROPS.some((c) => c.key === req.crop) ? req.crop : STUDY_DEFAULTS.crop;
  const stationKey =
    typeof req.station === "string" && STATIONS.some((s) => s.key === req.station) ? req.station : STUDY_DEFAULTS.station;
  const monthRaw = Math.trunc(num(req.plantingMonth, STUDY_DEFAULTS.plantingMonth));
  const plantingMonth = monthRaw >= 0 && monthRaw <= 11 ? monthRaw : STUDY_DEFAULTS.plantingMonth;
  const method = METHODS.includes(req.method as IrrigationMethod) ? (req.method as IrrigationMethod) : STUDY_DEFAULTS.method;
  const feddansIn = num(req.feddans, STUDY_DEFAULTS.feddans);
  const costIn = num(req.costPerFeddan, STUDY_DEFAULTS.costPerFeddan);
  const tariffIn = num(req.waterTariff, STUDY_DEFAULTS.waterTariff);
  const manualPrice = typeof req.manualPrice === "string" ? req.manualPrice : typeof req.manualPrice === "number" ? String(req.manualPrice) : "";

  // FeasibilityStudy.tsx, line for line: the market, then a typed price over it.
  const base: CropMarket = ctx.markets?.[cropKey] ?? {
    cropKey,
    faostatItem: null,
    sudanKgPerHa: null,
    nearestPeerKgPerHa: null,
    peerMedianKgPerHa: null,
    usdPerTonne: null,
    priceBasis: "none",
    year: null,
  };
  const typed = Number(manualPrice);
  const market: CropMarket =
    manualPrice.trim() !== "" && Number.isFinite(typed) && typed > 0 ? { ...base, usdPerTonne: typed, priceBasis: "manual" } : base;

  const crop = ALL_CROPS.find((c) => c.key === cropKey)!;
  const station = STATIONS.find((s) => s.key === stationKey)!;
  const feddans = Number.isFinite(feddansIn) && feddansIn > 0 ? feddansIn : 1;
  const study = phasedFeasibility({
    crop,
    station,
    plantingMonth,
    method,
    feddans,
    costPerFeddan: Number.isFinite(costIn) && costIn >= 0 ? costIn : 0,
    usdPerCubicMetre: Number.isFinite(tariffIn) && tariffIn > 0 ? tariffIn : 0,
    market,
  });
  if (!study) return null;

  const advice = irrigationAdvice(cropKey, method, feddans, study.water.m3PerFeddan * IRRIGATION_EFFICIENCY[method]);

  const inputs = CROP_INPUTS[cropKey];
  const est = estimateCostPerFeddan(cropKey);
  const needs =
    inputs && est
      ? {
          system: inputs.system.ar,
          seedKg: inputs.seedKg,
          seedNote: inputs.seedNote?.ar ?? null,
          ureaKg: inputs.ureaKg,
          phosphate: inputs.phosphate,
          timing: inputs.timing?.ar ?? null,
          sprays: inputs.sprays?.ar ?? null,
          operations: inputs.operations.ar,
          sources: inputs.sources,
          estimate: {
            lines: est.lines.map((l) => ({ name: l.ar, qty: l.qty, usd: l.usd })),
            totalUsd: est.totalUsd,
            missing: est.missing.map((m) => m.ar),
          },
          localReferences: LOCAL_REFERENCES.map((r) => ({ text: r.ar, source: r.source })),
          fertiliserSource: INPUT_PRICES.urea.source,
          // «حوّلها إلى مشروع» exists only where the website offers it: a crop with a published input list.
          canMakeProject: true,
        }
      : null;
  // Shown only where the website shows them (a crop with no input list), as written, never in a sum.
  const published = needs
    ? []
    : publishedCostsFor(cropKey).map((c) => ({
        figure: c.figure,
        basis: c.basis.ar,
        season: c.season,
        place: c.place.ar,
        source: c.source,
        url: c.url,
      }));

  // FeasibilityRisks.tsx: pest control is a known cost off the margin; the rest are expected losses.
  const sprays = num(req.sprays, 0);
  const sprayUsd = num(req.sprayUsd, 0);
  const protectionUsd = sprays > 0 && sprayUsd > 0 ? sprays * sprayUsd * study.feddans : 0;
  const settings = riskSettingsFrom(req.risks);
  const risk = summariseRisks(
    settings,
    study.revenueAtNational,
    study.marginAtNational === null ? null : study.marginAtNational - protectionUsd,
  );

  const near = (ctx.locust?.lands ?? []).filter((l) => l.nearest && l.nearest.km <= LOCUST_ALERT_KM);

  return {
    input: {
      crop: cropKey,
      cropName: crop.name,
      station: stationKey,
      stationName: station.name,
      plantingMonth,
      method,
      feddans: study.feddans,
      costPerFeddan: Number.isFinite(costIn) && costIn >= 0 ? costIn : 0,
      waterTariff: Number.isFinite(tariffIn) && tariffIn > 0 ? tariffIn : 0,
      manualPrice: market.priceBasis === "manual" ? market.usdPerTonne : null,
    },
    referenceUnavailable: ctx.markets === null,
    fx: { sdgPerUsd: ctx.sdgPerUsd, sdgPerUsdParallel: ctx.sdgPerUsdParallel },
    advice: {
      chosen: method,
      recommended: advice.recommended,
      savingM3PerFeddan: advice.savingM3PerFeddan,
      savingShare: advice.savingShare,
      pivotMinFeddans: PIVOT_MIN_FEDDANS,
      methods: advice.methods.map((m) => ({ ...m, label: IRRIGATION_LABEL[m.method] })),
    },
    needs,
    published,
    reference: {
      sudanKgPerHa: market.sudanKgPerHa,
      nearestPeerKgPerHa: market.nearestPeerKgPerHa,
      peerMedianKgPerHa: market.peerMedianKgPerHa,
      usdPerTonne: market.usdPerTonne,
      year: market.year,
      priceBasis: market.priceBasis,
      priceBasisLabel: PRICE_BASIS_LABEL[market.priceBasis],
      priceBasisNote: PRICE_BASIS_NOTE[market.priceBasis],
      stationSource: STATION_SOURCE_LABEL[station.source],
    },
    phases: study.phases.map((p) => ({ ...p, verdictLabel: PHASE_VERDICT_LABEL[p.verdict] })),
    lastSafeExit: study.lastSafeExit,
    verdict: study.verdict,
    verdictLabel: PHASE_VERDICT_LABEL[study.verdict],
    breakEvenKgPerHa: study.breakEvenKgPerHa,
    totals: {
      fieldCost: study.fieldCost,
      waterM3Total: study.waterM3Total,
      waterCost: study.waterCost,
      totalCost: study.totalCost,
      costPerFeddan: study.costPerFeddan,
      revenueAtNational: study.revenueAtNational,
      marginAtNational: study.marginAtNational,
      revenueAtPeer: study.revenueAtPeer,
      marginAtPeer: study.marginAtPeer,
      m3PerFeddan: study.water.m3PerFeddan,
    },
    risks: {
      settings,
      protectionUsd,
      sprayNote: inputs?.sprays?.ar ?? null,
      rows: risk.rows.map((r) => ({ key: r.setting.key, expectedUsd: r.expectedUsd })),
      expectedTotalUsd: risk.expectedTotalUsd,
      reserveTotalUsd: risk.reserveTotalUsd,
      uncounted: risk.uncounted,
      marginAfterUsd: risk.marginAfterUsd,
      badYear: risk.badYear,
    },
    locust: ctx.locust
      ? {
          counts: ctx.locust.counts.map((c) => ({ ...c, label: locustLabel(c.category, "ar"), day: locustDay(c.lastDate, "ar") })),
          places: ctx.locust.places.map((p) => ({ ...p, label: locustLabel(p.category, "ar"), day: locustDay(p.lastDate, "ar") })),
          gregarious: ctx.locust.counts.some((c) => isGregarious(c.category)),
          signedIn: ctx.locust.signedIn,
          near: near.map((l) => ({
            land: l.land,
            km: l.nearest!.km,
            label: locustLabel(l.nearest!.category, "ar"),
            day: locustDay(l.nearest!.date, "ar"),
            place: [l.nearest!.place, l.nearest!.country].filter(Boolean).join(", "),
          })),
          alertKm: LOCUST_ALERT_KM,
          hubUrl: LOCUST_HUB_URL,
        }
      : null,
  };
}

export type FeasibilityReport = NonNullable<ReturnType<typeof feasibilityReport>>;
