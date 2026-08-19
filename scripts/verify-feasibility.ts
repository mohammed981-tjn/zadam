import { CROPS, STATIONS } from "../src/lib/agronomy";
import { STAGE_TEMPLATES } from "../src/lib/season";
import {
  grossRevenue,
  breakEvenYieldKgPerHa,
  HECTARES_PER_FEDDAN,
  COMMITTING_STAGES,
  FAOSTAT_ITEM,
  type CropMarket,
} from "../src/lib/cropBenchmark";
import { phasedFeasibility } from "../src/lib/feasibility";

let fail = 0;
function ok(cond: boolean, label: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
}
function near(got: number, want: number, tol: number, label: string) {
  ok(Math.abs(got - want) <= tol, `${label} — got ${got.toFixed(2)}, want ~${want}`);
}

const crop = (k: string) => CROPS.find((c) => c.key === k)!;
const station = (k: string) => STATIONS.find((s) => s.key === k)!;

/** Sudan's real figures, as loaded from FAOSTAT 2023. */
const SORGHUM: CropMarket = {
  cropKey: "sorghum",
  faostatItem: "Sorghum",
  sudanKgPerHa: 510,
  nearestPeerKgPerHa: 5158, // Egypt
  peerMedianKgPerHa: 2700,
  usdPerTonne: 333, // Sudan's own export unit value
  priceBasis: "sudan_export",
  year: 2023,
};

console.log("=".repeat(74));
console.log("A) Revenue and break-even are inverses of each other");
console.log("=".repeat(74));
// 510 kg/ha over 100 feddan at $333/t:
//   0.510 t/ha × 0.4201 ha/fd × 100 fd × $333 = $7,135
near(
  grossRevenue(510, 100, 333)!,
  0.51 * HECTARES_PER_FEDDAN * 100 * 333,
  0.01,
  "revenue for Sudan's sorghum yield on 100 feddan",
);
// The yield that recovers exactly that revenue must be the yield itself.
near(
  breakEvenYieldKgPerHa(grossRevenue(510, 100, 333)!, 100, 333)!,
  510,
  0.01,
  "break-even of the revenue at a yield returns that yield",
);
ok(
  grossRevenue(510, 100, null) === null &&
    breakEvenYieldKgPerHa(1000, 100, null) === null,
  "no price means null, not a zero that reads as free",
);
ok(
  breakEvenYieldKgPerHa(1000, 0, 333) === null,
  "zero feddan is refused rather than dividing by it",
);

console.log("\n" + "=".repeat(74));
console.log("B) The phase ladder");
console.log("=".repeat(74));
const study = phasedFeasibility({
  crop: crop("sorghum"),
  station: station("gezira"),
  plantingMonth: 5,
  method: "flood",
  feddans: 100,
  costPerFeddan: 120,
  usdPerCubicMetre: 0.02,
  market: SORGHUM,
})!;

ok(study !== null, "a well-formed study is produced");
ok(study.phases.length === COMMITTING_STAGES.length, "one step per committing stage");
near(
  study.phases.reduce((s, p) => s + p.cost, 0),
  study.totalCost,
  0.01,
  "phase costs sum to the total — no money appears or vanishes",
);
near(
  study.phases[study.phases.length - 1].cumulativeCost,
  study.totalCost,
  0.01,
  "the last phase has committed the whole budget",
);
near(
  study.phases[study.phases.length - 1].breakEvenKgPerHa!,
  study.breakEvenKgPerHa!,
  0.01,
  "and its break-even equals the season break-even",
);

// Monotonicity: you can never owe less by spending more.
let monotonic = true;
for (let i = 1; i < study.phases.length; i++) {
  if (study.phases[i].cumulativeCost < study.phases[i - 1].cumulativeCost) monotonic = false;
  if (study.phases[i].breakEvenKgPerHa! < study.phases[i - 1].breakEvenKgPerHa!) monotonic = false;
}
ok(monotonic, "committed cost and break-even yield both only ever rise");

console.log(
  `\n  السيناريو: ذرة رفيعة · الجزيرة · ١٠٠ فدان · ١٢٠$/فدان · ماء ٠٫٠٢$/م³`,
);
console.log(
  `  التكلفة الكلية ${Math.round(study.totalCost).toLocaleString("en-US")}$ ` +
    `(حقل ${Math.round(study.fieldCost).toLocaleString("en-US")} + ماء ${Math.round(study.waterCost).toLocaleString("en-US")})`,
);
for (const p of study.phases) {
  console.log(
    `    ${p.name.padEnd(14)} ملتزم ${Math.round(p.cumulativeCost).toString().padStart(6)}$  ` +
      `تعادل ${Math.round(p.breakEvenKgPerHa!).toString().padStart(6)} كجم/هـ  ${p.verdict}` +
      (p.lastSafeExit ? "   ← آخر مخرج آمن" : ""),
  );
}
console.log(
  `  الوطني ${SORGHUM.sudanKgPerHa} · مصر ${SORGHUM.nearestPeerKgPerHa} · الحكم ${study.verdict}`,
);

console.log("\n" + "=".repeat(74));
console.log("C) The last safe exit — the point of the whole file");
console.log("=".repeat(74));
// Cheap enough that even the full season is recoverable at 510 kg/ha.
const cheap = phasedFeasibility({
  crop: crop("sorghum"), station: station("gezira"), plantingMonth: 5,
  method: "flood", feddans: 100, costPerFeddan: 5, market: SORGHUM,
})!;
ok(cheap.verdict === "within_national", "a cheap season is recoverable at the national average");
ok(cheap.lastSafeExit === "harvest", "and its last safe exit is the final phase");

// Expensive enough that nothing is recoverable, not even the first instalment.
const ruinous = phasedFeasibility({
  crop: crop("sorghum"), station: station("gezira"), plantingMonth: 5,
  method: "flood", feddans: 100, costPerFeddan: 9000, market: SORGHUM,
})!;
ok(ruinous.lastSafeExit === null, "a ruinous season has no safe exit at all");
ok(ruinous.verdict === "beyond_peer", "and is beyond even Egypt's yield");

// The interesting middle: safe early, unsafe later. $140/feddan puts the full
// season's break-even at about 1,000 kg/ha, so the ladder crosses Sudan's 510
// somewhere in the middle. The first draft used $30 and was safe at every
// phase — the case was wrong, not the engine.
const middling = phasedFeasibility({
  crop: crop("sorghum"), station: station("gezira"), plantingMonth: 5,
  method: "flood", feddans: 100, costPerFeddan: 140, market: SORGHUM,
})!;
const safeCount = middling.phases.filter((p) => p.verdict === "within_national").length;
ok(
  safeCount > 0 && safeCount < middling.phases.length,
  `a middling season is safe for some phases only (${safeCount}/${middling.phases.length})`,
);
ok(
  middling.phases.filter((p) => p.lastSafeExit).length === 1,
  "exactly one phase is marked as the last safe exit",
);
const exitIndex = middling.phases.findIndex((p) => p.lastSafeExit);
ok(
  middling.phases.slice(exitIndex + 1).every((p) => p.verdict !== "within_national"),
  "and nothing after it is recoverable at the national average",
);

console.log("\n" + "=".repeat(74));
console.log("D) Missing data degrades to 'unknown', never to a number");
console.log("=".repeat(74));
const priceless = phasedFeasibility({
  crop: crop("alfalfa"), station: station("gezira"), plantingMonth: 0,
  method: "flood", feddans: 50, costPerFeddan: 100,
  market: {
    cropKey: "alfalfa", faostatItem: null, sudanKgPerHa: null,
    nearestPeerKgPerHa: null, peerMedianKgPerHa: null,
    usdPerTonne: null, priceBasis: "none", year: null,
  },
})!;
ok(priceless.breakEvenKgPerHa === null, "no price gives no break-even");
ok(priceless.revenueAtNational === null, "and no revenue");
ok(priceless.marginAtNational === null, "and no margin — not a margin of minus the cost");
ok(priceless.verdict === "unknown", "the verdict is 'unknown'");
ok(priceless.lastSafeExit === null, "and no phase is claimed safe");
ok(priceless.totalCost > 0, "but the cost side is still computed and shown");

console.log("\n" + "=".repeat(74));
console.log("E) Guards on the inputs");
console.log("=".repeat(74));
const bad = { crop: crop("sorghum"), station: station("gezira"), plantingMonth: 5,
  method: "flood" as const, market: SORGHUM };
ok(phasedFeasibility({ ...bad, feddans: 0, costPerFeddan: 100 }) === null, "zero feddan refused");
ok(phasedFeasibility({ ...bad, feddans: -5, costPerFeddan: 100 }) === null, "negative feddan refused");
ok(phasedFeasibility({ ...bad, feddans: 10, costPerFeddan: -1 }) === null, "negative cost refused");
ok(
  phasedFeasibility({ ...bad, feddans: 10, costPerFeddan: 0 }) !== null,
  "a zero field cost is allowed — an owner doing the work themselves still needs the study",
);

console.log("\n" + "=".repeat(74));
console.log("F) The catalogue and the stage shares line up");
console.log("=".repeat(74));
const shareSum = COMMITTING_STAGES.reduce((s, k) => s + STAGE_TEMPLATES[k].budgetShare, 0);
near(shareSum, 1, 1e-9, "budget shares over the committing stages sum to exactly 1");
const mapped = Object.keys(FAOSTAT_ITEM);
ok(
  mapped.every((k) => CROPS.some((c) => c.key === k)),
  "every mapped crop key exists in the crop table",
);
ok(
  CROPS.filter((c) => !mapped.includes(c.key)).every((c) => c.key === "alfalfa"),
  "alfalfa is the only crop without a FAOSTAT item, as documented",
);

console.log("\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`));
process.exit(fail === 0 ? 0 : 1);
