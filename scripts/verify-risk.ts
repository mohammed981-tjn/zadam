import {
  assessProject,
  returnBand,
  CROP_ECONOMICS,
  type ProjectFacts,
} from "../src/lib/risk";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const base: ProjectFacts = {
  cropKey: "wheat",
  stationKey: "gezira",
  plantingMonth: 10,
  irrigation: "flood",
  waterSource: "canal",
  declaredWaterPerFeddan: 3600,
  documentsOnFile: 4,
  documentsRequired: 4,
  operatorSeasons: 3,
  operatorReportingRate: 1,
  kmToMarket: 10,
};

console.log("=".repeat(78));
console.log("A) A fully documented, well-watered project should score high");
console.log("=".repeat(78));
const good = assessProject(base);
console.log(
  `  score ${good.score}/100 -> ${good.level}, blockers: ${good.blockers.length}`,
);
for (const f of good.factors)
  console.log(
    `    ${f.label.padEnd(22)} w=${String(f.weight).padStart(2)} s=${f.score.toFixed(2)}  ${f.detail}`,
  );
ok(good.score >= 75 && good.level === "low", "scores low-risk");
ok(good.blockers.length === 0, "no blockers");

console.log("\n" + "=".repeat(78));
console.log("B) The checks that must block publication");
console.log("=".repeat(78));
const noDocs = assessProject({ ...base, documentsOnFile: 1 });
ok(
  noDocs.blockers.some((b) => b.includes("التوثيق")),
  "missing documents blocks publication",
);
console.log(`    -> ${noDocs.blockers[0]}`);

const dry = assessProject({ ...base, declaredWaterPerFeddan: 1200 });
ok(
  dry.blockers.some((b) => b.includes("المياه")),
  "insufficient water blocks publication",
);
console.log(`    -> ${dry.blockers[0]}`);
ok(dry.score < good.score, "insufficient water lowers the score");

const unknown = assessProject({ ...base, cropKey: "banana" });
ok(
  unknown.score === 0 && unknown.blockers.length > 0,
  "unknown crop rejected, not silently scored",
);

console.log("\n" + "=".repeat(78));
console.log("C) Monotonicity — better inputs must never score worse");
console.log("=".repeat(78));
let mono = true;
for (let d = 0; d <= 4; d++) {
  const s = assessProject({ ...base, documentsOnFile: d }).score;
  const s2 = assessProject({
    ...base,
    documentsOnFile: Math.min(4, d + 1),
  }).score;
  if (s2 < s - 1e-9) mono = false;
}
ok(mono, "more documents never lowers the score");

let waterMono = true,
  prev = -1;
for (let w = 0; w <= 6000; w += 250) {
  const s = assessProject({ ...base, declaredWaterPerFeddan: w }).score;
  if (s < prev - 1e-9) waterMono = false;
  prev = s;
}
ok(waterMono, "more water never lowers the score");

let kmMono = true;
prev = 1e9;
for (let k = 0; k <= 200; k += 10) {
  const s = assessProject({ ...base, kmToMarket: k }).score;
  if (s > prev + 1e-9) kmMono = false;
  prev = s;
}
ok(kmMono, "greater distance to market never raises the score");

console.log("\n" + "=".repeat(78));
console.log("D) Score bounds and weight integrity");
console.log("=".repeat(78));
const weights = good.factors.reduce((a, f) => a + f.weight, 0);
ok(weights === 100, `weights sum to exactly 100 (got ${weights})`);
let outOfRange = 0,
  n = 0;
const crops = Object.keys(CROP_ECONOMICS);
const stations = [
  "khartoum",
  "gezira",
  "rivernile",
  "northern",
  "kordofan",
  "kassala",
];
const sources = ["canal", "river_pump", "borehole", "rainfed"] as const;
for (const c of crops)
  for (const st of stations)
    for (const src of sources)
      for (const w of [0, 2000, 5000, 20000]) {
        const r = assessProject({
          ...base,
          cropKey: c,
          stationKey: st,
          waterSource: src,
          declaredWaterPerFeddan: w,
        });
        n++;
        if (r.score < 0 || r.score > 100 || !isFinite(r.score)) outOfRange++;
        for (const f of r.factors) if (f.score < 0 || f.score > 1) outOfRange++;
      }
ok(outOfRange === 0, `${n} combinations, all scores within bounds`);

console.log("\n" + "=".repeat(78));
console.log("E) Return bands — realistic and correctly ordered");
console.log("=".repeat(78));
for (const c of crops) {
  const b = returnBand(c)!;
  console.log(
    `  ${c.padEnd(11)} P10=${b.p10.toFixed(0).padStart(6)}  P50=${b.p50.toFixed(0).padStart(6)}  P90=${b.p90.toFixed(0).padStart(6)} $/feddan   ` +
      `P50=${b.p50Pct.toFixed(0).padStart(4)}%  loss prob ${(b.lossProbability * 100).toFixed(0).padStart(2)}%`,
  );
}
let ordered = true,
  finite = true;
for (const c of crops) {
  const b = returnBand(c)!;
  if (!(b.p10 <= b.p50 && b.p50 <= b.p90)) ordered = false;
  if (![b.p10, b.p50, b.p90, b.lossProbability].every(isFinite)) finite = false;
  if (b.lossProbability < 0 || b.lossProbability > 1) finite = false;
}
ok(ordered, "P10 <= P50 <= P90 for every crop");
ok(finite, "all values finite, probability within [0,1]");

const wheat = returnBand("wheat")!;
ok(
  wheat.p50 > 0 && wheat.p50 < 600,
  `wheat median net $${wheat.p50.toFixed(0)}/feddan is plausible for Sudan`,
);
ok(wheat.p50Pct < 200, "median return is not a fantasy multiple");

console.log("\n  water stress must cut the return and raise the loss odds:");
const full = returnBand("wheat", 1.0)!,
  half = returnBand("wheat", 0.5)!;
console.log(
  `    coverage 100%: P50=$${full.p50.toFixed(0)}  loss ${(full.lossProbability * 100).toFixed(0)}%`,
);
console.log(
  `    coverage  50%: P50=$${half.p50.toFixed(0)}  loss ${(half.lossProbability * 100).toFixed(0)}%`,
);
ok(half.p50 < full.p50, "water stress lowers median profit");
ok(
  half.lossProbability > full.lossProbability,
  "water stress raises probability of loss",
);

ok(
  returnBand("banana") === null,
  "unknown crop returns null rather than a made-up number",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
