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

// Drip must need less delivered water than flood — wherever irrigation is
// needed at all. The qualifier is not a weakening: adding Kurmuk, at 918 mm of
// rain a year, made this check fail on sorghum and millet, and the engine was
// right. Rain covers them outright, both methods deliver zero, and zero is not
// less than zero. A check that forbids the correct answer is the broken party.
let effBad = 0;
let rainfed = 0;
for (const c of CROPS)
  for (const s of STATIONS) {
    const f = waterRequirement(c, s, 5, "flood"),
      d = waterRequirement(c, s, 5, "drip");
    if (f.totalGross === 0) {
      rainfed++;
      continue;
    }
    if (d.totalGross >= f.totalGross) effBad++;
  }
console.log(
  `  ${effBad === 0 ? "PASS" : "FAIL"}  drip below flood wherever irrigation is needed ` +
    `(${rainfed} crop/station pairs are fully rain-fed)`,
);
if (effBad) fail++;

console.log("\n" + "=".repeat(78));
console.log("G) Station table invariants");
console.log("=".repeat(78));
// The check that would have caught the mistake actually made while adding the
// four NASA POWER stations: T2M_MAX/T2M_MIN are monthly *extremes*, and using
// them handed El Fasher a 4 °C January and a diurnal range near 35 °C. ET0
// scales with the square root of that range, so the error is silent and large.
// A real inland Sudanese station sits between roughly 8 and 25 °C of range.
let stBad = 0;
for (const s of STATIONS) {
  const arrays: [string, number[]][] = [
    ["tmax", s.tmax],
    ["tmin", s.tmin],
    ["rainfall", s.rainfall],
  ];
  for (const [label, arr] of arrays)
    if (arr.length !== 12) {
      console.log(`  FAIL ${s.key}.${label} has ${arr.length} months`);
      stBad++;
    }
  if (s.latitude < 3.5 || s.latitude > 22.5) {
    console.log(`  FAIL ${s.key} latitude ${s.latitude} outside Sudan`);
    stBad++;
  }
  if (s.longitude < 21.5 || s.longitude > 38.8) {
    console.log(`  FAIL ${s.key} longitude ${s.longitude} outside Sudan`);
    stBad++;
  }
  for (let m = 0; m < 12; m++) {
    const range = s.tmax[m] - s.tmin[m];
    if (range < 5 || range > 30) {
      console.log(
        `  FAIL ${s.key} month ${m + 1}: diurnal range ${range}°C — extremes mistaken for means?`,
      );
      stBad++;
    }
    if (s.rainfall[m] < 0) {
      console.log(`  FAIL ${s.key} month ${m + 1}: negative rainfall`);
      stBad++;
    }
  }
  const annual = s.rainfall.reduce((a, b) => a + b, 0);
  if (annual > 1200) {
    console.log(
      `  FAIL ${s.key} annual rainfall ${annual}mm — too wet for Sudan`,
    );
    stBad++;
  }
}
console.log(
  `  ${stBad === 0 ? "PASS" : "FAIL"}  ${STATIONS.length} stations, ${stBad} violations`,
);
if (stBad) fail++;

console.log("\n" + "=".repeat(78));
console.log("H) Crop table invariants, and the two crops added from FAO-56");
console.log("=".repeat(78));
let cropBad = 0;
for (const c of CROPS) {
  const total = c.stages.reduce((a, b) => a + b, 0);
  // The upper bound is 400 and not 365 because virgin sugarcane genuinely
  // stands 380 days in FAO-56 Table 11 — the first draft of this check said
  // 370 and failed the crop rather than the bound.
  if (total < 60 || total > 400) {
    console.log(`  FAIL ${c.key} season length ${total} days`);
    cropBad++;
  }
  const kcs: [string, number][] = [
    ["kcInitial", c.kcInitial],
    ["kcMid", c.kcMid],
    ["kcEnd", c.kcEnd],
  ];
  for (const [label, kc] of kcs)
    if (kc < 0.2 || kc > 1.35) {
      console.log(`  FAIL ${c.key}.${label} = ${kc} outside the FAO-56 range`);
      cropBad++;
    }
}
console.log(
  `  ${cropBad === 0 ? "PASS" : "FAIL"}  ${CROPS.length} crops, ${cropBad} violations`,
);
if (cropBad) fail++;

// Read straight off FAO-56 Table 11 and Table 12.
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
check("millet season length", sum(crop("millet").stages), 105, 105, " d");
check("millet Kc mid", crop("millet").kcMid, 1.0, 1.0);
check("millet Kc end", crop("millet").kcEnd, 0.3, 0.3);
check("dates Kc mid", crop("dates").kcMid, 0.95, 0.95);
check("dates cycle length", sum(crop("dates").stages), 365, 365, " d");

// Millet is the short, drought-adapted cereal of the west: over its season it
// must want less water than sorghum, which stands twenty-five days longer.
check(
  "sorghum minus millet, gross, El Fasher",
  waterRequirement(crop("sorghum"), st("elfasher"), 6, "flood").totalGross -
    waterRequirement(crop("millet"), st("elfasher"), 6, "flood").totalGross,
  1,
  1e9,
  " m³/fd",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK GROUP(S) FAILED`),
);

// The other ten verifiers end on this line and this one did not: it printed
// FAIL and exited 0. On a laptop that is a harmless inconsistency. Wired into
// CI it is worse than having no check at all, because a failing check reports
// success and the build is trusted on the strength of it.
process.exit(fail === 0 ? 0 : 1);
