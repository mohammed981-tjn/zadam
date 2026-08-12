import {
  planSeason,
  summariseLedger,
  disbursementDecision,
  STAGE_TEMPLATES,
  type StageKey,
  type LedgerEntry,
} from "../src/lib/season";
import { CROPS, STATIONS } from "../src/lib/agronomy";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("=".repeat(76));
console.log(
  "A) A real season plan: wheat, Gezira, planted 15 November, 50 feddans",
);
console.log("=".repeat(76));
const p = planSeason("wheat", "gezira", "2026-11-15", "flood", 50, 120)!;
ok(!!p, "plan generated");
console.log(`  planting ${p.plantingDate} -> harvest ${p.harvestDate}`);
console.log(
  `  total water ${p.totalWaterM3.toLocaleString("en-US")} m3   budget $${p.totalBudget.toLocaleString("en-US")}`,
);
console.log();
for (const s of p.stages) {
  console.log(
    `  ${String(s.order).padStart(2)} ${s.name.padEnd(20)} ${s.startDate} -> ${s.endDate} ` +
      `(${String(s.days).padStart(3)}d)  ماء ${String(s.waterM3).padStart(6)} م³  دفعة $${String(s.budget).padStart(5)}`,
  );
}

console.log("\n" + "=".repeat(76));
console.log("B) Invariants the plan must always satisfy");
console.log("=".repeat(76));
ok(p.stages.length === 7, "all seven stages present");
ok(p.stages[0].key === "land_prep", "land preparation comes first");
ok(p.stages[p.stages.length - 1].key === "harvest", "harvest comes last");
ok(p.stages[0].startDate < p.plantingDate, "land prep starts before planting");

let chronological = true;
for (let i = 1; i < p.stages.length; i++) {
  if (p.stages[i].startDate < p.stages[i - 1].startDate) chronological = false;
}
ok(chronological, "stages are in chronological order");

const shareSum = Object.values(STAGE_TEMPLATES).reduce(
  (a, t) => a + t.budgetShare,
  0,
);
ok(
  Math.abs(shareSum - 1) < 1e-9,
  `budget shares sum to exactly 1 (got ${shareSum.toFixed(4)})`,
);
ok(
  Math.abs(p.totalBudget - 50 * 120) <= 7,
  `budget totals the input ($${p.totalBudget} vs $${50 * 120}, rounding only)`,
);

// Water must match what the agronomy engine says for the same inputs.
const perFeddan = p.totalWaterM3 / 50;
console.log(
  `  water per feddan from the season plan: ${Math.round(perFeddan)} m3`,
);
ok(
  perFeddan > 2500 && perFeddan < 4500,
  "season water per feddan is in the range the FAO-56 engine gives",
);

const flowering = p.stages.find((s) => s.key === "flowering")!;
const maturity = p.stages.find((s) => s.key === "maturity")!;
ok(
  flowering.waterM3 > maturity.waterM3,
  "flowering needs more water than maturity, as the Kc curve requires",
);

console.log("\n" + "=".repeat(76));
console.log("C) Bad input is refused, not guessed at");
console.log("=".repeat(76));
ok(
  planSeason("banana", "gezira", "2026-11-15", "flood", 50, 120) === null,
  "unknown crop refused",
);
ok(
  planSeason("wheat", "atlantis", "2026-11-15", "flood", 50, 120) === null,
  "unknown station refused",
);
ok(
  planSeason("wheat", "gezira", "not-a-date", "flood", 50, 120) === null,
  "bad date refused",
);
ok(
  planSeason("wheat", "gezira", "2026-11-15", "flood", 0, 120) === null,
  "zero area refused",
);
ok(
  planSeason("wheat", "gezira", "2026-11-15", "flood", -5, 120) === null,
  "negative area refused",
);

console.log("\n" + "=".repeat(76));
console.log("D) Every crop, station, method and month produces a sane plan");
console.log("=".repeat(76));
let bad = 0,
  n = 0;
for (const c of CROPS)
  for (const s of STATIONS)
    for (const m of [0, 3, 6, 9]) {
      for (const irr of ["flood", "drip"] as const) {
        const plan = planSeason(
          c.key,
          s.key,
          `2026-${String(m + 1).padStart(2, "0")}-10`,
          irr,
          10,
          100,
        );
        n++;
        if (!plan) {
          bad++;
          continue;
        }
        if (plan.stages.length !== 7) bad++;
        if (plan.totalWaterM3 < 0 || !isFinite(plan.totalWaterM3)) bad++;
        if (plan.harvestDate <= plan.plantingDate) bad++;
        if (plan.stages.some((st) => st.days <= 0 || st.budget < 0)) bad++;
      }
    }
ok(bad === 0, `${n} combinations, ${bad} problems`);

// Drip must always plan less water than flood.
let effBad = 0;
for (const c of CROPS)
  for (const s of STATIONS) {
    const f = planSeason(c.key, s.key, "2026-06-10", "flood", 10, 100)!;
    const d = planSeason(c.key, s.key, "2026-06-10", "drip", 10, 100)!;
    if (d.totalWaterM3 >= f.totalWaterM3) effBad++;
  }
ok(effBad === 0, "drip always plans less water than flood");

console.log("\n" + "=".repeat(76));
console.log("E) The ledger");
console.log("=".repeat(76));
const entries: LedgerEntry[] = [
  { category: "seeds", amount: 900 },
  { category: "fertiliser", amount: 1800 },
  { category: "labour", amount: 1500 },
  { category: "irrigation", amount: 1100 },
  { category: "pesticide", amount: 400 },
  { category: "transport", amount: 300 },
  { category: "revenue", amount: 9200 },
];
const sum = summariseLedger(entries, 50, 6000);
console.log(
  `  costs $${sum.costs}  revenue $${sum.revenue}  profit $${sum.profit}  ` +
    `per feddan $${sum.profitPerFeddan.toFixed(2)}  budget used ${Math.round(sum.budgetUsed * 100)}%`,
);
console.log(
  `  biggest cost: ${sum.byCategory[0].label} $${sum.byCategory[0].amount}`,
);
ok(sum.costs === 6000, "costs exclude revenue");
ok(sum.revenue === 9200, "revenue separated");
ok(sum.profit === 3200, "profit is revenue minus costs");
ok(Math.abs(sum.profitPerFeddan - 64) < 1e-9, "profit per feddan correct");
ok(sum.byCategory[0].category === "fertiliser", "categories sorted by size");
ok(
  summariseLedger([], 0, 0).profitPerFeddan === 0,
  "zero area does not divide by zero",
);
ok(
  summariseLedger([{ category: "seeds", amount: NaN }], 10, 100).costs === 0,
  "NaN amounts ignored",
);

console.log("\n" + "=".repeat(76));
console.log("F) The disbursement gate — protection for both sides");
console.log("=".repeat(76));
const mk = (spec: [StageKey, boolean, number][]) =>
  spec.map(([key, completed, evidenceCount]) => ({
    key,
    completed,
    evidenceCount,
  }));

const s1 = mk([
  ["land_prep", true, 2],
  ["planting", false, 1],
  ["harvest", false, 0],
]);
ok(
  disbursementDecision(s1, 0).released,
  "first stage releases when complete with evidence",
);
ok(!disbursementDecision(s1, 1).released, "stage awaiting sign-off is held");
console.log(`    -> ${disbursementDecision(s1, 1).reason}`);
ok(
  !disbursementDecision(s1, 2).released,
  "harvest money is NOT released while the crop is growing",
);
console.log(`    -> ${disbursementDecision(s1, 2).reason}`);

const s2 = mk([
  ["land_prep", true, 1],
  ["planting", true, 0],
]);
ok(
  !disbursementDecision(s2, 1).released,
  "signed off but with no evidence is still held",
);
console.log(`    -> ${disbursementDecision(s2, 1).reason}`);

const s3 = mk([
  ["land_prep", false, 3],
  ["planting", true, 3],
]);
ok(
  !disbursementDecision(s3, 1).released,
  "cannot skip ahead of an unfinished earlier stage",
);
ok(
  !disbursementDecision(s3, 99).released,
  "out-of-range index refused, not crashed",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
