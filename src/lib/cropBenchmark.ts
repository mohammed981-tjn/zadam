/**
 * مرجعية غلة المحاصيل — ما هو مثبت، وما هو ناقص.
 *
 * The platform already derives what a crop *needs*: agronomy.ts computes the
 * seasonal water requirement from FAO-56, and season.ts turns it into a dated
 * plan. What it has never had is the other half — what a crop actually *yields*
 * here, against what it yields elsewhere. Without that, a farmer can see a
 * water figure and still have no idea whether their harvest was good.
 *
 * THIS FILE IS DELIBERATELY SMALL, AND THAT IS THE POINT
 *
 * The intended reference covers Brazil, Argentina, the United States, China,
 * India, Australia and New Zealand alongside Sudan. Only the Sudan and world
 * figures below are recorded, because only those were actually verified.
 *
 * The three authoritative sources — yieldgap.org (Global Yield Gap Atlas),
 * ourworldindata.org and FAOSTAT — are all blocked by this environment's egress
 * policy, so their numbers could not be read. Filling the table from memory
 * would produce exactly the failure agronomy.ts opens by describing: figures
 * asserted rather than derived, wrong by a factor nobody can check. An empty
 * row is honest; a plausible invented one is not.
 *
 * TO COMPLETE IT
 *
 * Pull per-country cereal yields from FAOSTAT (Production → Crops and livestock
 * products → Yield), or the water-limited potential Yw from yieldgap.org for
 * Sudanese weather stations, and add rows below with their source and year.
 * The shape is ready; only the data is missing.
 */

export interface CropBenchmark {
  cropKey: string;
  /** Region or country the figure describes. */
  scope: string;
  /** Actual achieved yield, tonnes per hectare. */
  yieldTHa: number;
  /** The year or period the figure covers. */
  period: string;
  /** Where it came from, named so a reader can go and check it. */
  source: string;
}

/**
 * Verified figures only.
 *
 * Sudan's sorghum yield is the number that should govern how this platform
 * talks about ambition. It has not stagnated — it has fallen by more than half
 * in sixty years, from 1.0 t/ha in 1961 to 0.4 t/ha in 2020, against a world
 * average of roughly 1.1–1.5. A Sudanese farmer reaching the ordinary world
 * average would be roughly tripling the national norm.
 *
 * That is also why closing Sudan's sorghum gap is worth so much globally:
 * Nigeria, Sudan and Ethiopia together account for more than 62% of the
 * achievable increase in world sorghum production.
 */
export const CROP_BENCHMARKS: CropBenchmark[] = [
  {
    cropKey: "sorghum",
    scope: "السودان",
    yieldTHa: 0.4,
    period: "2020",
    source: "Frontiers in Sustainable Food Systems (2023), global sorghum assessment",
  },
  {
    cropKey: "sorghum",
    scope: "السودان",
    yieldTHa: 1.0,
    period: "1961",
    source: "Frontiers in Sustainable Food Systems (2023), global sorghum assessment",
  },
  {
    cropKey: "sorghum",
    scope: "المتوسط العالمي",
    yieldTHa: 1.3,
    period: "≈2020",
    source: "Frontiers in Sustainable Food Systems (2023) — reported range 1.1–1.5 t/ha",
  },
];

/** Crops for which a benchmark exists at all. Everything else returns null. */
export function benchmarksFor(cropKey: string): CropBenchmark[] {
  return CROP_BENCHMARKS.filter((b) => b.cropKey === cropKey);
}

export interface YieldComparison {
  cropKey: string;
  /** What the operator expects or achieved, t/ha. */
  actualTHa: number;
  /** The national figure to compare against, if one is recorded. */
  national: CropBenchmark | null;
  /** The world figure, if one is recorded. */
  world: CropBenchmark | null;
  /** Ratio to the world average — null when no world figure exists. */
  ratioToWorld: number | null;
}

/**
 * Places a yield against the recorded benchmarks.
 *
 * Returns nulls rather than substitutes when a benchmark is missing, so a
 * screen shows "لا توجد مرجعية لهذا المحصول بعد" instead of comparing against a
 * number that was never verified. A missing comparison is information; a
 * fabricated one is a lie with a decimal point.
 */
export function compareYield(
  cropKey: string,
  actualTHa: number,
): YieldComparison | null {
  if (!Number.isFinite(actualTHa) || actualTHa <= 0) return null;

  const rows = benchmarksFor(cropKey);
  if (rows.length === 0) return null;

  // The most recent national figure, and the world figure if present.
  const national =
    rows
      .filter((r) => r.scope === "السودان")
      .sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
  const world = rows.find((r) => r.scope === "المتوسط العالمي") ?? null;

  return {
    cropKey,
    actualTHa,
    national,
    world,
    ratioToWorld: world ? actualTHa / world.yieldTHa : null,
  };
}
