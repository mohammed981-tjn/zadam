/**
 * دراسة الجدوى المرحلية — تعاقد مالي منفصل لكل مرحلة.
 *
 * THE REQUEST THIS ANSWERS
 *
 * The fourth of the agricultural engineer's points: each production phase
 * should be contracted and financed separately, after a feasibility study for
 * that phase — rather than signing one agreement for a whole season and
 * discovering in month five that it never worked.
 *
 * WHY A SEASON TOTAL DOES NOT ANSWER IT
 *
 * The platform can already say what a season costs and what it needs in water.
 * That is a single verdict delivered before anything is planted, and it is the
 * wrong shape for the question. Money leaves in instalments, the harvest
 * arrives once at the end, and the decision a farmer actually faces is not "is
 * this season viable" but "having spent what I have spent, do I spend the
 * next instalment".
 *
 * So the study is a ladder rather than a number. At each phase it reports what
 * has been committed so far and converts that into the only currency the
 * decision can be judged in: **the yield required at harvest to get it back**.
 *
 * THE NUMBER THAT MATTERS MOST IS THE LAST SAFE EXIT
 *
 * Break-even yield climbs with every instalment. At some phase it passes what
 * Sudan actually averages for that crop, and from there on the money is
 * committed to an above-average harvest. That phase is the last point at which
 * stopping is the cheaper mistake, and naming it is the single most useful
 * thing this file does — it is invisible in a season total, because a season
 * total has already assumed the whole thing was paid.
 *
 * A study can therefore end in "viable at the national average", "viable only
 * above it", or "not viable at any yield this crop reaches here" — and the
 * third verdict is one the platform previously had no way to reach.
 */

import { STAGE_TEMPLATES, type StageKey } from "./season";
import {
  breakEvenYieldKgPerHa,
  grossRevenue,
  COMMITTING_STAGES,
  type CropMarket,
} from "./cropBenchmark";
import {
  waterRequirement,
  type CropCoefficients,
  type StationClimate,
  type IrrigationMethod,
  type WaterRequirement,
} from "./agronomy";

/** How a phase's break-even sits against what this crop actually yields here. */
export type PhaseVerdict =
  | "within_national" // recoverable at Sudan's own average — the safe zone
  | "needs_peer" // needs better than national, but Egypt reaches it
  | "beyond_peer" // needs more than the nearest comparable system achieves
  | "unknown"; // no price or no yield reference

export const PHASE_VERDICT_LABEL: Record<PhaseVerdict, string> = {
  within_national: "يُسترد بالمتوسط الوطني",
  needs_peer: "يحتاج أعلى من المتوسط الوطني",
  beyond_peer: "يحتاج أعلى ممّا تبلغه مصر",
  unknown: "لا يمكن الحكم — بيانات ناقصة",
};

export interface PhaseStep {
  stage: StageKey;
  name: string;
  /** Share of the season budget released at this stage. */
  budgetShare: number;
  cost: number;
  cumulativeCost: number;
  cumulativeShare: number;
  /** Yield at harvest that would recover everything committed up to here. */
  breakEvenKgPerHa: number | null;
  verdict: PhaseVerdict;
  /** True for the last phase that is still recoverable at the national average. */
  lastSafeExit: boolean;
}

export interface FeasibilityInput {
  crop: CropCoefficients;
  station: StationClimate;
  plantingMonth: number;
  method: IrrigationMethod;
  feddans: number;
  /** Field cost per feddan for the whole season, before water. */
  costPerFeddan: number;
  /** Optional water tariff. Zero for rain-fed or an own-source well. */
  usdPerCubicMetre?: number;
  market: CropMarket;
}

export interface FeasibilityStudy {
  feddans: number;
  water: WaterRequirement;
  waterM3Total: number;
  waterCost: number;
  fieldCost: number;
  totalCost: number;
  costPerFeddan: number;
  revenueAtNational: number | null;
  revenueAtPeer: number | null;
  marginAtNational: number | null;
  marginAtPeer: number | null;
  /** Yield needed to recover the full season. */
  breakEvenKgPerHa: number | null;
  phases: PhaseStep[];
  /** The last phase recoverable at the national average, if any. */
  lastSafeExit: StageKey | null;
  verdict: PhaseVerdict;
}

function classify(
  breakEven: number | null,
  market: CropMarket,
): PhaseVerdict {
  if (breakEven === null) return "unknown";
  const national = market.sudanKgPerHa;
  const peer = market.nearestPeerKgPerHa ?? market.peerMedianKgPerHa;
  if (national === null) return "unknown";
  if (breakEven <= national) return "within_national";
  if (peer !== null && breakEven <= peer) return "needs_peer";
  if (peer === null) return "unknown";
  return "beyond_peer";
}

/**
 * Builds the phase ladder for one season.
 *
 * Costs follow STAGE_TEMPLATES.budgetShare — the cash profile already used to
 * release season budget, reused deliberately so the study and the contract it
 * informs cannot disagree about when money leaves.
 */
export function phasedFeasibility(
  input: FeasibilityInput,
): FeasibilityStudy | null {
  const { crop, station, plantingMonth, method, feddans, market } = input;
  if (!Number.isFinite(feddans) || feddans <= 0) return null;
  if (!Number.isFinite(input.costPerFeddan) || input.costPerFeddan < 0) {
    return null;
  }

  const water = waterRequirement(crop, station, plantingMonth, method);
  const waterM3Total = water.m3PerFeddan * feddans;
  const tariff = input.usdPerCubicMetre ?? 0;
  const waterCost = waterM3Total * (tariff > 0 ? tariff : 0);
  const fieldCost = input.costPerFeddan * feddans;
  const totalCost = fieldCost + waterCost;

  // Both field cost and water are spread across the phases by the same budget
  // share, so a phase's committed position is simply that share of the total.
  //
  // For water that is a proxy and worth naming as one. FAO-56 divides a season
  // into four stages while this platform's calendar has seven, so there is no
  // honest mapping from the monthly water curve onto these phases — and the
  // proxy is known to understate mid-season, when the crop drinks most. It is
  // used because the alternative is a fabricated schedule, and because the
  // number the study turns on is the cumulative position at harvest, where the
  // proxy and the truth agree exactly.
  let cumulativeShare = 0;
  const steps: PhaseStep[] = COMMITTING_STAGES.map((stage) => {
    const template = STAGE_TEMPLATES[stage];
    cumulativeShare += template.budgetShare;
    const committed = totalCost * cumulativeShare;
    const breakEven = breakEvenYieldKgPerHa(
      committed,
      feddans,
      market.usdPerTonne,
    );
    return {
      stage,
      name: template.name,
      budgetShare: template.budgetShare,
      cost: totalCost * template.budgetShare,
      cumulativeCost: committed,
      cumulativeShare,
      breakEvenKgPerHa: breakEven,
      verdict: classify(breakEven, market),
      lastSafeExit: false,
    };
  });

  // The last phase still recoverable at the national average. Found by walking
  // backwards: break-even only rises, so the last "within_national" is the
  // boundary.
  let lastSafeExit: StageKey | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].verdict === "within_national") {
      steps[i].lastSafeExit = true;
      lastSafeExit = steps[i].stage;
      break;
    }
  }

  const breakEven = breakEvenYieldKgPerHa(
    totalCost,
    feddans,
    market.usdPerTonne,
  );
  const revenueAtNational = grossRevenue(
    market.sudanKgPerHa,
    feddans,
    market.usdPerTonne,
  );
  const revenueAtPeer = grossRevenue(
    market.nearestPeerKgPerHa ?? market.peerMedianKgPerHa,
    feddans,
    market.usdPerTonne,
  );

  return {
    feddans,
    water,
    waterM3Total,
    waterCost,
    fieldCost,
    totalCost,
    costPerFeddan: totalCost / feddans,
    revenueAtNational,
    revenueAtPeer,
    marginAtNational:
      revenueAtNational === null ? null : revenueAtNational - totalCost,
    marginAtPeer: revenueAtPeer === null ? null : revenueAtPeer - totalCost,
    breakEvenKgPerHa: breakEven,
    phases: steps,
    lastSafeExit,
    verdict: classify(breakEven, market),
  };
}
