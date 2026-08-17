import {
  extraterrestrialRadiation,
  referenceEt0,
  effectiveRainfall,
  cropCoefficient,
  waterRequirement,
  CROPS,
  STATIONS,
  MONTH_NAMES,
} from "../src/lib/agronomy";

const crop = (k: string) => CROPS.find((c) => c.key === k)!;
const st = (k: string) => STATIONS.find((s) => s.key === k)!;
let fail = 0;
function check(label: string, got: number, lo: number, hi: number, unit = "") {
  const ok = got >= lo && got <= hi;
  if (!ok) fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${got.toFixed(2).padStart(9)}${unit}  expect ${lo}-${hi}`,
  );
}

console.log("=".repeat(78));
console.log("A) Ra against FAO-56 Annex 2 Table (Ra in mm/day)");
console.log("=".repeat(78));
// FAO-56 Table 2.6: lat 20N -> Jan15 ~10.8, Jul15 ~16.3 ; lat 0 -> ~13-15 all year
check("Ra  20N  Jan 15", extraterrestrialRadiation(20, 15), 10.2, 11.4);
check("Ra  20N  Jul 15", extraterrestrialRadiation(20, 196), 15.8, 16.8);
check(
  "Ra  20N  Mar 21 (equinox)",
  extraterrestrialRadiation(20, 80),
  13.8,
  14.8,
);
check("Ra   0N  Jan 15", extraterrestrialRadiation(0, 15), 14.0, 15.4);
check(
  "Ra  40N  Dec 15 (winter, low)",
  extraterrestrialRadiation(40, 349),
  4.5,
  6.5,
);
check(
  "Ra -20S  Jan 15 (S. hemisphere summer)",
  extraterrestrialRadiation(-20, 15),
  16.5,
  18.0,
);

console.log("\n" + "=".repeat(78));
console.log("B) ET0 for Sudan — should be very high (arid, hot)");
console.log("=".repeat(78));
const kh = st("khartoum");
for (const m of [0, 3, 6, 9]) {
  const v = referenceEt0(
    kh.tmax[m],
    kh.tmin[m],
    kh.latitude,
    [15, 105, 196, 288][[0, 3, 6, 9].indexOf(m)],
  );
  console.log(
    `  Khartoum ${MONTH_NAMES[m].padEnd(8)} ET0 = ${v.toFixed(2)} mm/day`,
  );
}
// Khartoum annual ET0 is documented around 2,300-2,800 mm/yr
let annual = 0;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  MID = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
for (let m = 0; m < 12; m++)
  annual += referenceEt0(kh.tmax[m], kh.tmin[m], kh.latitude, MID[m]) * DIM[m];
check("Khartoum ANNUAL ET0", annual, 2000, 3000, " mm");

console.log("\n" + "=".repeat(78));
console.log("C) Effective rainfall (USDA-SCS)");
console.log("=".repeat(78));
check("Pe(0mm)", effectiveRainfall(0), 0, 0);
check("Pe(50mm)", effectiveRainfall(50), 44, 47);
check("Pe(100mm)", effectiveRainfall(100), 82, 86);
check("Pe(150mm)", effectiveRainfall(150), 113, 119);
console.log("  monotonic + never exceeds input:");
let mono = true,
  over = false,
  prev = -1;
for (let p = 0; p <= 240; p += 10) {
  const e = effectiveRainfall(p);
  if (e < prev) mono = false;
  if (e > p) over = true;
  prev = e;
}
console.log(`  ${mono ? "PASS" : "FAIL"}  monotonically increasing`);
if (!mono) fail++;
console.log(`  ${!over ? "PASS" : "FAIL"}  Pe never exceeds P`);
if (over) fail++;

console.log("\n" + "=".repeat(78));
console.log("D) Kc curve shape");
console.log("=".repeat(78));
const w = crop("wheat");
const pts = [0, 10, 19, 20, 32, 45, 46, 70, 85, 109];
console.log(
  "  wheat Kc: " +
    pts.map((d) => `d${d}=${cropCoefficient(w, d).toFixed(2)}`).join("  "),
);
check("Kc at day 0 = Kc_ini", cropCoefficient(w, 0), 0.29, 0.31);
check("Kc at mid-season = Kc_mid", cropCoefficient(w, 70), 1.14, 1.16);
check("Kc at end = Kc_end", cropCoefficient(w, 109), 0.29, 0.35);
let maxKc = 0;
for (let d = 0; d < 110; d++) maxKc = Math.max(maxKc, cropCoefficient(w, d));
check("Kc never exceeds Kc_mid", maxKc, 1.14, 1.16);

console.log("\n" + "=".repeat(78));
console.log("E) Seasonal water requirement vs published Sudan figures");
console.log("=".repeat(78));
// FAO/Gezira references: wheat in Sudan ~ 450-600mm net; cotton ~ 800-1100mm net
const cases: [string, string, number][] = [
  ["wheat", "gezira", 10], // Nov planting
  ["wheat", "northern", 10],
  ["sorghum", "gezira", 5], // Jun planting (rainy)
  ["cotton", "gezira", 6], // Jul planting
  ["groundnut", "kordofan", 5],
  ["alfalfa", "khartoum", 0],
];
for (const [ck, sk, pm] of cases) {
  const r = waterRequirement(crop(ck), st(sk), pm, "flood");
  console.log(
    `  ${crop(ck).name.padEnd(12)} @ ${st(sk).name.padEnd(20)} زراعة ${MONTH_NAMES[pm].padEnd(8)} ` +
      `ETc=${r.totalEtc.toFixed(0).padStart(4)}mm  مطر=${r.totalEffectiveRain.toFixed(0).padStart(3)}mm  ` +
      `صافي=${r.totalNet.toFixed(0).padStart(4)}mm  إجمالي=${r.totalGross.toFixed(0).padStart(4)}mm  ` +
      `= ${r.m3PerFeddan.toFixed(0).padStart(5)} م³/فدان  ذروة ${MONTH_NAMES[r.peakMonthIndex]}`,
  );
}
const wg = waterRequirement(crop("wheat"), st("gezira"), 10, "flood");
check("wheat/Gezira net requirement", wg.totalNet, 350, 650, " mm");
const cg = waterRequirement(crop("cotton"), st("gezira"), 6, "flood");
check("cotton/Gezira ETc", cg.totalEtc, 700, 1200, " mm");

console.log("\n" + "=".repeat(78));
console.log("F) INVARIANTS (the checks that catch real bugs)");
console.log("=".repeat(78));
let bad = 0,
  tested = 0;
for (const c of CROPS)
  for (const s of STATIONS)
    for (let pm = 0; pm < 12; pm++)
      for (const meth of ["flood", "drip"] as const) {
        const r = waterRequirement(c, s, pm, meth);
        tested++;
        const sumDays = r.monthly.reduce((a, b) => a + b.days, 0);
        if (sumDays !== r.seasonDays) {
          console.log(
            `  FAIL days ${c.key}/${s.key}/${pm}: ${sumDays} vs ${r.seasonDays}`,
          );
          bad++;
        }
        if (r.totalNet > r.totalEtc + 1e-6) {
          console.log(`  FAIL net>ETc ${c.key}/${s.key}`);
          bad++;
        }
        if (r.totalGross < r.totalNet - 1e-6) {
          console.log(`  FAIL gross<net ${c.key}/${s.key}`);
          bad++;
        }
        if (r.m3PerFeddan < 0 || !isFinite(r.m3PerFeddan)) {
          console.log(`  FAIL m3 ${c.key}/${s.key}`);
          bad++;
        }
        const recomputed = r.monthly.reduce((a, b) => a + b.grossIrrigation, 0);
        if (Math.abs(recomputed - r.totalGross) > 1e-6) {
          console.log(`  FAIL total mismatch ${c.key}/${s.key}`);
          bad++;
        }
        if (r.peakM3PerFeddanPerDay <= 0 && r.totalGross > 0) {
          console.log(`  FAIL peak ${c.key}/${s.key}`);
          bad++;
        }
      }
console.log(
  `  ${bad === 0 ? "PASS" : "FAIL"}  ${tested} combinations, ${bad} invariant violations`,
);
if (bad) fail++;

// drip must always need less delivered water than flood
let effBad = 0;
for (const c of CROPS)
  for (const s of STATIONS) {
    const f = waterRequirement(c, s, 5, "flood"),
      d = waterRequirement(c, s, 5, "drip");
    if (d.totalGross >= f.totalGross) effBad++;
  }
console.log(
  `  ${effBad === 0 ? "PASS" : "FAIL"}  drip always below flood in delivered volume`,
);
if (effBad) fail++;

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK GROUP(S) FAILED`),
);

// The other ten verifiers end on this line and this one did not: it printed
// FAIL and exited 0. On a laptop that is a harmless inconsistency. Wired into
// CI it is worse than having no check at all, because a failing check reports
// success and the build is trusted on the strength of it.
process.exit(fail === 0 ? 0 : 1);
