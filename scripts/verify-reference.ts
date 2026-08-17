/**
 * Checks the livestock reference model against its published anchors.
 *
 * The point of this file is that lib/reference.ts derives DSE ratings from
 * Kleiber's law rather than listing them, and a derivation is only worth
 * preferring to a list if it reproduces the values the list would have held.
 * So the sourced ratings — a 50 kg dry goat at 1 DSE, a yearling steer at
 * about 8 — are asserted here against the model, not in prose next to it.
 *
 * Tolerances are wide deliberately. A "yearling steer" is a class rather than a
 * weight, and a model tuned until it hit the published figure exactly would be
 * fitted to two points instead of derived from a principle.
 */

import {
  maintenanceDse,
  herdDemand,
  SOURCED_ANCHORS,
  PURPOSE_FACTOR,
  DSE_DM_KG_PER_YEAR,
  DSE_REFERENCE_WEIGHT_KG,
  UA_WEIGHT_KG,
  TROPICAL_STOCKING_UA_PER_HA,
  LACTATION_INTAKE_UPLIFT,
  SPECIES_REFERENCE,
} from "../src/lib/reference";

let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
}

function near(label: string, got: number, want: number, tol: number) {
  check(
    label,
    Math.abs(got - want) <= tol,
    `${got.toFixed(2)} vs ${want} ±${tol}`,
  );
}

console.log("\nDSE definition");
near(
  "reference wether is exactly 1 DSE",
  maintenanceDse(DSE_REFERENCE_WEIGHT_KG),
  1,
  0.001,
);

console.log("\nPublished anchors the derivation must reproduce");
for (const a of SOURCED_ANCHORS) {
  // The steer anchor is a growing animal, so maintenance alone should fall
  // short of it — the growth factor is what closes the gap.
  const withGrowth =
    a.weightKg > 100
      ? maintenanceDse(a.weightKg) * PURPOSE_FACTOR.meat
      : maintenanceDse(a.weightKg);
  near(a.label, withGrowth, a.dse, a.tolerance);
}

console.log("\nKleiber scaling, not linear");
{
  const sheep = maintenanceDse(45);
  const cow = maintenanceDse(450);
  check(
    "a 10× heavier animal eats well under 10× as much",
    cow / sheep < 7,
    `${(cow / sheep).toFixed(2)}× for 10× weight`,
  );
  check(
    "and clearly more than 4×",
    cow / sheep > 4,
    `${(cow / sheep).toFixed(2)}×`,
  );
}

console.log("\nLactation uplift (NRC 35–50%)");
{
  const dry = maintenanceDse(350);
  const milking = dry * PURPOSE_FACTOR.dairy;
  const uplift = milking / dry - 1;
  check(
    "dairy factor sits inside the published range",
    uplift >= LACTATION_INTAKE_UPLIFT.low && uplift <= LACTATION_INTAKE_UPLIFT.high,
    `${(uplift * 100).toFixed(1)}%`,
  );
}

console.log("\nBrazilian animal units");
{
  const d = herdDemand("cattle", "meat", 45, 365, UA_WEIGHT_KG)!;
  near("45 head of 450 kg cattle = 45 UA", d.animalUnits, 45, 0.01);
  check(
    "pasture need falls inside the tropical stocking range",
    d.pastureHectares.low === 45 / TROPICAL_STOCKING_UA_PER_HA.high &&
      d.pastureHectares.high === 45 / TROPICAL_STOCKING_UA_PER_HA.low,
    `${d.pastureHectares.low.toFixed(0)}–${d.pastureHectares.high.toFixed(0)} ha`,
  );
  check(
    "higher stocking rate means less land, not more",
    d.pastureHectares.low < d.pastureHectares.high,
  );
}

console.log("\nDry matter budget");
{
  const year = herdDemand("sheep", "meat", 1, 365, DSE_REFERENCE_WEIGHT_KG)!;
  const maintenanceOnly = year.dryMatterKg / PURPOSE_FACTOR.meat;
  near(
    "one reference wether eats ~550 kg DM a year at maintenance",
    maintenanceOnly,
    DSE_DM_KG_PER_YEAR,
    1,
  );

  const half = herdDemand("sheep", "meat", 1, 182, DSE_REFERENCE_WEIGHT_KG)!;
  near(
    "half a year is half the dry matter",
    half.dryMatterKg / year.dryMatterKg,
    0.5,
    0.01,
  );
}

console.log("\nHerd scale is linear in head count");
{
  const one = herdDemand("goat", "dairy", 1, 90)!;
  const hundred = herdDemand("goat", "dairy", 100, 90)!;
  near("100 head is 100×", hundred.dse / one.dse, 100, 0.001);
  near(
    "per-head daily figure does not move with herd size",
    hundred.dailyPerHeadKg,
    one.dailyPerHeadKg,
    0.0001,
  );
}

console.log("\nSanity of the species table");
for (const s of SPECIES_REFERENCE) {
  check(
    `${s.key}: entry weight below mature weight`,
    s.entryWeightKg <= s.matureWeightKg,
    `${s.entryWeightKg} ≤ ${s.matureWeightKg} kg`,
  );
}
check(
  "every ruminant carries at least one named Sudanese breed",
  SPECIES_REFERENCE.filter((s) =>
    ["cattle", "sheep", "goat", "camel"].includes(s.key),
  ).every((s) => s.sudanBreeds.length > 0),
);

console.log("\nRejections");
check("zero head returns null", herdDemand("cattle", "meat", 0, 90) === null);
check("negative days returns null", herdDemand("cattle", "meat", 10, -5) === null);
check("zero weight yields zero DSE", maintenanceDse(0) === 0);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
