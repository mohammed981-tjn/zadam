/**
 * المرجعية الدولية للإنتاج الحيواني والرعوي.
 *
 * livestock.ts shipped with a flat intake share per species — 2.5% of body
 * weight for cattle, 3.5% for sheep — applied identically whether the animal
 * was being fattened, milked or carried through gestation. That is defensible
 * as a first sketch and wrong as a reference, and this file replaces it with
 * something that can be argued with.
 *
 * WHY A NORMALISING UNIT AT ALL
 *
 * Comparing "100 sheep" with "20 cattle" needs a common denominator, and two
 * countries built one independently:
 *
 *   DSE — Dry Sheep Equivalent (Australia, New Zealand). One DSE is the feed a
 *   two-year-old 45–50 kg Merino wether needs to hold its weight: 7.6 MJ of
 *   metabolisable energy a day, about 550 kg of dry matter a year. Carrying
 *   capacity is expressed in DSE per hectare.
 *
 *   UA — Unidade Animal (Brazil, and Latin America generally). One UA is 450 kg
 *   of live cattle. Tropical pasture under decent management carries roughly
 *   0.5–2 UA per hectare.
 *
 * Both are here because they answer different questions. DSE compares feed
 * demand across species and classes, which is what a mixed Sudanese herd needs.
 * UA is the unit the tropical-pasture literature reports stocking rates in, and
 * Sudan's rangelands are tropical, not temperate — so a Brazilian stocking
 * figure transfers better than an Australian one.
 *
 * WHAT IS SOURCED AND WHAT IS DERIVED
 *
 * Sourced anchors, each cited at its constant:
 *   · 1 DSE = 7.6 MJ ME/day ≈ 550 kg DM/year (MLA)
 *   · 1 UA  = 450 kg live weight; 0.5–2 UA/ha tropical pasture (Embrapa)
 *   · a 50 kg dry goat = 1 DSE; a yearling steer ≈ 8 DSE (MLA)
 *   · lactating beef cattle eat 35–50% more dry matter than non-lactating of
 *     the same size on the same diet (NRC, via US extension services)
 *
 * Derived, not asserted: the DSE rating of any other animal. Maintenance energy
 * scales with metabolic weight — W^0.75, Kleiber's law, the standard
 * relationship in animal nutrition — so an animal's maintenance rating is
 * (W/45)^0.75, calibrated so the reference wether is exactly 1. Class
 * multipliers for growth and lactation are then applied on top.
 *
 * The derivation is checked against the sourced anchors in
 * scripts/verify-reference.ts rather than left as a claim.
 *
 * WHAT THIS IS NOT
 *
 * It is not a Sudanese feeding standard, because no such published standard
 * exists at this resolution. It is an internationally grounded starting point
 * that a Sudanese operator calibrates against their own animals and forage —
 * and every screen that shows a number from here says so.
 */

import type { HerdPurpose, LivestockSpecies } from "@/types/database";

/* ---------------------------------------------------------------------------
 * The sourced anchors.
 * ------------------------------------------------------------------------ */

/** Live weight of the reference Merino wether, in kg. One DSE by definition. */
export const DSE_REFERENCE_WEIGHT_KG = 45;

/** Metabolisable energy of one DSE, MJ per day. Meat & Livestock Australia. */
export const DSE_MJ_PER_DAY = 7.6;

/**
 * Dry matter one DSE eats in a year at maintenance, in kg. MLA feed budgeting.
 * The figure most often quoted for Australian conditions; forage quality moves
 * it, which is the first thing to calibrate locally.
 */
export const DSE_DM_KG_PER_YEAR = 550;

/** Live weight of one Brazilian Unidade Animal, in kg. Embrapa. */
export const UA_WEIGHT_KG = 450;

/** Stocking range on well-managed tropical pasture, UA per hectare. Embrapa. */
export const TROPICAL_STOCKING_UA_PER_HA = { low: 0.5, high: 2 } as const;

/**
 * How much more a lactating animal eats than a dry one of the same weight.
 *
 * NRC reports 35–50% for beef cattle; the midpoint is used, and the range is
 * kept so a screen can show it rather than implying a precision the source does
 * not carry.
 */
export const LACTATION_INTAKE_UPLIFT = { low: 0.35, high: 0.5, mid: 0.425 } as const;

/**
 * Anchors the derivation must reproduce, used by the verifier.
 *
 * These are the published ratings the model is checked against. Tolerances are
 * wide on purpose: a "yearling steer" is a class, not a weight, and any model
 * that hit these exactly would be fitted to them rather than derived.
 */
export const SOURCED_ANCHORS = [
  { label: "50 kg dry goat", weightKg: 50, dse: 1, tolerance: 0.25 },
  { label: "yearling steer ~400 kg growing", weightKg: 400, dse: 8, tolerance: 3 },
] as const;

/* ---------------------------------------------------------------------------
 * The derivation.
 * ------------------------------------------------------------------------ */

/**
 * Maintenance feed demand of an animal, in DSE.
 *
 * Kleiber's law: maintenance energy scales with body weight to the power 0.75,
 * not linearly. This matters more than it looks — a 450 kg cow does not eat ten
 * times what a 45 kg sheep eats, it eats about 5.6 times as much, and a model
 * that scaled linearly would overstate a cattle herd's feed by nearly half.
 */
export function maintenanceDse(liveWeightKg: number): number {
  if (!Number.isFinite(liveWeightKg) || liveWeightKg <= 0) return 0;
  return Math.pow(liveWeightKg / DSE_REFERENCE_WEIGHT_KG, 0.75);
}

/**
 * Multiplier applied on top of maintenance for what the animal is doing.
 *
 * Lactation comes from NRC. The others are conventional planning factors for
 * growing and pregnant stock: they are labelled here rather than hidden, and
 * they are the values most worth challenging with local data.
 */
export const PURPOSE_FACTOR: Record<HerdPurpose, number> = {
  // Milking: NRC's 35–50% uplift, midpoint.
  dairy: 1 + LACTATION_INTAKE_UPLIFT.mid,
  // Laying birds, treated the same way — production above maintenance.
  eggs: 1 + LACTATION_INTAKE_UPLIFT.mid,
  // Growing to weight: intake above maintenance to fund gain.
  fattening: 1.4,
  meat: 1.3,
  // A breeding herd averages dry, pregnant and lactating females across the
  // cycle, so it sits between maintenance and full lactation.
  breeding: 1.25,
};

export interface SpeciesReference {
  key: LivestockSpecies;
  /** Typical mature live weight in Sudanese conditions, kg. */
  matureWeightKg: number;
  /** Typical weight at entry to a production cycle, kg. */
  entryWeightKg: number;
  /** Gestation length in days, null where not modelled. */
  gestationDays: number | null;
  /** Named Sudanese breeds and where they are kept. */
  sudanBreeds: { name: string; region: string; note: string }[];
}

/**
 * Species as kept in Sudan.
 *
 * The breeds are the point of this table. Sudan's cattle are not a generic
 * tropical average: Kenana and Butana are dairy zebu, unusual among zebu
 * breeds and concentrated between the Blue and White Niles and in the Butana;
 * Baggara is a beef animal of the dry west, selected by survival in Sahelian
 * heat. Planning a dairy cycle on a Baggara herd, or a fattening cycle on
 * Kenana, is a mistake the platform can warn about only if it knows this.
 */
export const SPECIES_REFERENCE: SpeciesReference[] = [
  {
    key: "cattle",
    matureWeightKg: 350,
    entryWeightKg: 250,
    gestationDays: 283,
    sudanBreeds: [
      {
        name: "كنانة",
        region: "بين النيلين الأزرق والأبيض",
        note: "زيبو حلوب — من قلائل سلالات الزيبو المرباة للّبن.",
      },
      {
        name: "البطانة",
        region: "شرق الخرطوم — سهل البطانة",
        note: "زيبو حلوب، شقيقة كنانة في الغرض والتحمّل.",
      },
      {
        name: "البقارة",
        region: "غرب السودان",
        note: "سلالة لحوم متأقلمة مع حرارة الساحل وجفافه.",
      },
    ],
  },
  {
    key: "sheep",
    matureWeightKg: 45,
    entryWeightKg: 30,
    gestationDays: 150,
    sudanBreeds: [
      {
        name: "ضأن الصحراء",
        region: "الحزام شبه الصحراوي",
        note: "يُربّى مع الإبل في نطاق شبه صحراوي ضيّق.",
      },
      {
        name: "الحمري",
        region: "جنوب غرب كردفان وجنوب شرق دارفور",
        note: "من طرز ضأن الصحراء، وأشهر طرز التصدير.",
      },
    ],
  },
  {
    key: "goat",
    matureWeightKg: 35,
    entryWeightKg: 25,
    gestationDays: 150,
    sudanBreeds: [
      {
        name: "النوبي",
        region: "الشمالية ووادي النيل",
        note: "يُربّى للّبن واللحم معاً.",
      },
    ],
  },
  {
    key: "camel",
    matureWeightKg: 450,
    entryWeightKg: 350,
    gestationDays: 390,
    sudanBreeds: [
      {
        name: "العنافي والبشاري",
        region: "شرق السودان وشماله",
        note: "الحزام بين خطي العرض ١٢ و١٨ يحمل معظم إبل البلاد.",
      },
    ],
  },
  {
    key: "poultry",
    matureWeightKg: 2,
    entryWeightKg: 1.5,
    gestationDays: null,
    sudanBreeds: [],
  },
  {
    key: "fish",
    matureWeightKg: 0.5,
    entryWeightKg: 0.3,
    gestationDays: null,
    sudanBreeds: [],
  },
];

export const REFERENCE_BY_SPECIES: Record<LivestockSpecies, SpeciesReference> =
  Object.fromEntries(SPECIES_REFERENCE.map((s) => [s.key, s])) as Record<
    LivestockSpecies,
    SpeciesReference
  >;

/* ---------------------------------------------------------------------------
 * What callers actually use.
 * ------------------------------------------------------------------------ */

export interface HerdDemand {
  /** Feed demand of the whole herd, in DSE. */
  dse: number;
  /** The same herd expressed in Brazilian animal units. */
  animalUnits: number;
  /** Dry matter for the whole herd over the given days, in kg. */
  dryMatterKg: number;
  /** Daily dry matter per head, in kg — the figure a herder recognises. */
  dailyPerHeadKg: number;
  /** Hectares of tropical pasture the herd needs, at each end of the range. */
  pastureHectares: { low: number; high: number };
}

/**
 * Feed and land demand for a herd, on the international units.
 *
 * Returns both the DSE view (what to feed) and the UA view (how much land),
 * because the two questions have different published answers and conflating
 * them is how a plan ends up feeding animals it has no room for.
 */
export function herdDemand(
  species: LivestockSpecies,
  purpose: HerdPurpose,
  headCount: number,
  days: number,
  liveWeightKg?: number,
): HerdDemand | null {
  const ref = REFERENCE_BY_SPECIES[species];
  if (!ref) return null;
  if (!Number.isFinite(headCount) || headCount <= 0) return null;
  if (!Number.isFinite(days) || days <= 0) return null;

  const weight = liveWeightKg ?? ref.entryWeightKg;
  const perHeadDse = maintenanceDse(weight) * (PURPOSE_FACTOR[purpose] ?? 1);
  const dse = perHeadDse * headCount;

  const dryMatterKg = dse * DSE_DM_KG_PER_YEAR * (days / 365);
  const animalUnits = (weight * headCount) / UA_WEIGHT_KG;

  return {
    dse,
    animalUnits,
    dryMatterKg,
    dailyPerHeadKg: (perHeadDse * DSE_DM_KG_PER_YEAR) / 365,
    pastureHectares: {
      // High stocking rate needs the least land, so it produces the low figure.
      low: animalUnits / TROPICAL_STOCKING_UA_PER_HA.high,
      high: animalUnits / TROPICAL_STOCKING_UA_PER_HA.low,
    },
  };
}
