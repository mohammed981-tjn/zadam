/**
 * Published per-feddan costs for the new crops: shown as written, never used in the sums (item 177; owner, 6 Nov 2026).
 *
 *   npx tsx scripts/verify-published-costs.ts
 */
import { readFileSync } from "node:fs";
import { ALL_CROPS } from "../src/lib/agronomy";
import { PUBLISHED_COSTS, publishedCostsFor } from "../src/lib/publishedCropCosts";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const keys = new Set(ALL_CROPS.map((c) => c.key));
ok(PUBLISHED_COSTS.every((c) => keys.has(c.crop)), "every row is a crop the calculator offers");
ok(PUBLISHED_COSTS.every((c) => /^https:\/\//.test(c.url) && c.source.length > 3), "every row names its source and links to it");
ok(PUBLISHED_COSTS.every((c) => /\b(SDG|SDD)\/(feddan|ha)\b/.test(c.figure)), "every figure keeps its own currency and unit");
for (const crop of ["sunflower", "safflower", "barley", "sweet_melon", "cucumber", "sweet_pepper", "cabbage", "carrot", "zucchini", "sweet_potato"]) {
  ok(publishedCostsFor(crop).length === 0, `no figure was found for ${crop}, so none is shown`);
}
const study = readFileSync("src/components/FeasibilityStudy.tsx", "utf8");
ok(!/publishedCostsFor\([^)]*\)\.[a-z]*\s*\(?.*costPerFeddan/.test(study) && !/setCostPerFeddan\([^)]*published/.test(study), "the study never runs on a published figure");

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
