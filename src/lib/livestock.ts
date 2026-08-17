/**
 * نموذج الإنتاج الحيواني — تخطيط دورة القطيع.
 *
 * The counterpart of agronomy.ts and season.ts for the animal side, and it
 * keeps the same promise: a herd plan is derived from the species, the purpose
 * and the head count, not typed into a form and then argued about.
 *
 * WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT
 *
 * The crop side rests on FAO-56, a single published method that yields a
 * defensible number for any crop and location. Animal production has no
 * equivalent single source: intake and growth depend on breed, forage quality,
 * climate and management to a degree that no table settles. The values below
 * are standard reference figures from animal-science practice — dry matter
 * intake as a share of body weight, gestation lengths, conventional quarantine
 * and fattening durations — and they are *starting points for a plan*, not
 * predictions.
 *
 * That distinction is deliberate and is surfaced to the user rather than
 * hidden: every derived figure here is labelled as an opening estimate that the
 * operator adjusts against their own animals. Presenting these with the same
 * confidence as an FAO-56 water requirement would be the exact error this
 * codebase was built to avoid — asserting a number instead of deriving it, and
 * letting the reader assume more precision than the method carries.
 */

import type { HerdPurpose, HerdStageKey, LivestockSpecies } from "@/types/database";

export const SPECIES_LABEL: Record<LivestockSpecies, string> = {
  cattle: "أبقار",
  sheep: "ضأن",
  goat: "ماعز",
  camel: "إبل",
  poultry: "دواجن",
  fish: "أسماك",
};

export const PURPOSE_LABEL: Record<HerdPurpose, string> = {
  meat: "لحوم",
  dairy: "ألبان",
  eggs: "بيض",
  breeding: "تربية وإكثار",
  fattening: "تسمين",
};

export const HERD_STAGE_LABEL: Record<HerdStageKey, string> = {
  acquisition: "الاقتناء",
  quarantine: "الحجر الصحي",
  conditioning: "التهيئة",
  breeding: "التلقيح",
  gestation: "الحمل",
  rearing: "التربية",
  fattening: "التسمين",
  production: "الإنتاج",
  offtake: "التسويق",
};

export interface SpeciesProfile {
  key: LivestockSpecies;
  name: string;
  /** Typical live weight at entry, in kg. Sudanese local breeds. */
  entryWeightKg: number;
  /**
   * Daily dry matter intake as a share of live weight. The single most
   * important planning figure, because feed dominates the budget the way water
   * dominates a crop's.
   */
  intakeShare: number;
  /** Gestation length in days; null for species where it does not apply here. */
  gestationDays: number | null;
  /** Purposes this species is actually kept for on the platform. */
  purposes: HerdPurpose[];
}

export const SPECIES: SpeciesProfile[] = [
  {
    key: "cattle",
    name: "أبقار",
    entryWeightKg: 250,
    intakeShare: 0.025,
    gestationDays: 283,
    purposes: ["meat", "dairy", "breeding", "fattening"],
  },
  {
    key: "sheep",
    name: "ضأن",
    entryWeightKg: 30,
    intakeShare: 0.035,
    gestationDays: 150,
    purposes: ["meat", "breeding", "fattening"],
  },
  {
    key: "goat",
    name: "ماعز",
    entryWeightKg: 25,
    intakeShare: 0.035,
    gestationDays: 150,
    purposes: ["meat", "dairy", "breeding", "fattening"],
  },
  {
    key: "camel",
    name: "إبل",
    entryWeightKg: 350,
    intakeShare: 0.02,
    gestationDays: 390,
    purposes: ["meat", "dairy", "breeding"],
  },
  {
    key: "poultry",
    name: "دواجن",
    entryWeightKg: 1.5,
    intakeShare: 0.05,
    gestationDays: null,
    purposes: ["meat", "eggs"],
  },
  {
    key: "fish",
    name: "أسماك",
    entryWeightKg: 0.3,
    intakeShare: 0.03,
    gestationDays: null,
    purposes: ["meat"],
  },
];

export const SPECIES_BY_KEY: Record<LivestockSpecies, SpeciesProfile> =
  Object.fromEntries(SPECIES.map((s) => [s.key, s])) as Record<
    LivestockSpecies,
    SpeciesProfile
  >;

/**
 * The phases each purpose runs through, with conventional durations in days.
 *
 * `gestation` carries a duration of 0 because its real length comes from the
 * species rather than the purpose — it is substituted in when the plan is
 * built. Quarantine is 21 days throughout: that is the standard observation
 * period for newly acquired animals, and shortening it is a decision with
 * disease consequences rather than a scheduling preference.
 */
const PLAN: Record<HerdPurpose, { key: HerdStageKey; days: number }[]> = {
  fattening: [
    { key: "acquisition", days: 7 },
    { key: "quarantine", days: 21 },
    { key: "conditioning", days: 14 },
    { key: "fattening", days: 90 },
    { key: "offtake", days: 14 },
  ],
  meat: [
    { key: "acquisition", days: 7 },
    { key: "quarantine", days: 21 },
    { key: "conditioning", days: 14 },
    { key: "rearing", days: 120 },
    { key: "fattening", days: 60 },
    { key: "offtake", days: 14 },
  ],
  dairy: [
    { key: "acquisition", days: 7 },
    { key: "quarantine", days: 21 },
    { key: "conditioning", days: 21 },
    { key: "production", days: 270 },
    { key: "offtake", days: 14 },
  ],
  eggs: [
    { key: "acquisition", days: 7 },
    { key: "quarantine", days: 14 },
    { key: "rearing", days: 126 },
    { key: "production", days: 300 },
    { key: "offtake", days: 14 },
  ],
  breeding: [
    { key: "acquisition", days: 7 },
    { key: "quarantine", days: 21 },
    { key: "conditioning", days: 21 },
    { key: "breeding", days: 45 },
    { key: "gestation", days: 0 },
    { key: "rearing", days: 90 },
    { key: "offtake", days: 14 },
  ],
};

export interface PlannedHerdStage {
  key: HerdStageKey;
  name: string;
  order: number;
  startDate: string;
  endDate: string;
  days: number;
  /** Opening estimate of dry matter for the whole herd over this phase, in kg. */
  feedKg: number;
  /** This phase's share of the cycle budget, apportioned by feed. */
  budget: number;
}

export interface HerdPlan {
  species: SpeciesProfile;
  purpose: HerdPurpose;
  headCount: number;
  startDate: string;
  endDate: string;
  stages: PlannedHerdStage[];
  totalFeedKg: number;
  totalBudget: number;
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Builds a dated phase plan for a herd.
 *
 * Feed is apportioned by phase length and head count, and the budget follows
 * feed rather than being split evenly — because feed is where the money goes,
 * so a phase that eats twice as long should carry twice the cost. Returns null
 * on inputs that cannot produce a plan, in the same shape as planSeason, so
 * callers handle both the same way.
 */
export function planHerd(
  speciesKey: string,
  purpose: string,
  headCount: number,
  startDate: string,
  budgetPerHead: number,
): HerdPlan | null {
  const species = SPECIES_BY_KEY[speciesKey as LivestockSpecies];
  const template = PLAN[purpose as HerdPurpose];

  if (!species || !template) return null;
  if (!species.purposes.includes(purpose as HerdPurpose)) return null;
  if (!Number.isFinite(headCount) || headCount <= 0) return null;
  if (!Number.isFinite(budgetPerHead) || budgetPerHead < 0) return null;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  // Substitute the species' own gestation length where the template defers.
  const phases = template
    .map((p) => ({
      ...p,
      days: p.key === "gestation" ? (species.gestationDays ?? 0) : p.days,
    }))
    // A species with no gestation (poultry, fish) simply loses that phase
    // rather than carrying a zero-length one that renders as a blank row.
    .filter((p) => p.days > 0);

  if (phases.length === 0) return null;

  const dailyFeedPerHead = species.entryWeightKg * species.intakeShare;
  const totalBudget = budgetPerHead * headCount;

  const feedByPhase = phases.map((p) => dailyFeedPerHead * headCount * p.days);
  const totalFeedKg = feedByPhase.reduce((a, b) => a + b, 0);

  /*
   * The parts must add up to the whole.
   *
   * Rounding each phase's share independently leaves a residue: 200 head of
   * sheep on a 9,000,000 budget produced phases summing to 9,000,001. One pound
   * is nothing; a farmer adding the column and getting a different total from
   * the one printed above it is not nothing, on a platform whose entire claim
   * is that its numbers can be re-derived and checked.
   *
   * So every phase but the last is rounded, and the last takes the remainder.
   * The drift lands in one place, is at most a few units, and the column always
   * reconciles.
   */
  const budgets: number[] = [];
  let allocated = 0;
  for (let i = 0; i < phases.length; i++) {
    if (i === phases.length - 1) {
      budgets.push(totalBudget - allocated);
    } else {
      const share =
        totalFeedKg > 0
          ? Math.round((feedByPhase[i] / totalFeedKg) * totalBudget)
          : 0;
      budgets.push(share);
      allocated += share;
    }
  }

  let cursor = start;
  const stages: PlannedHerdStage[] = phases.map((p, i) => {
    const phaseStart = cursor;
    const phaseEnd = new Date(cursor.getTime() + (p.days - 1) * DAY_MS);
    cursor = new Date(phaseEnd.getTime() + DAY_MS);

    return {
      key: p.key,
      name: HERD_STAGE_LABEL[p.key],
      order: i + 1,
      startDate: iso(phaseStart),
      endDate: iso(phaseEnd),
      days: p.days,
      feedKg: Math.round(feedByPhase[i]),
      budget: budgets[i],
    };
  });

  return {
    species,
    purpose: purpose as HerdPurpose,
    headCount,
    startDate: iso(start),
    endDate: stages[stages.length - 1].endDate,
    stages,
    totalFeedKg: Math.round(totalFeedKg),
    totalBudget,
  };
}
