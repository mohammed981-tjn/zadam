import { computeTrust, type SeasonRecord } from "../src/lib/trust";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const S = (o: Partial<SeasonRecord> = {}): SeasonRecord => ({
  status: "completed",
  feddans: 20,
  plannedBudget: 2400,
  actualCosts: 2300,
  revenue: 3400,
  stagesTotal: 7,
  stagesCompleted: 7,
  stagesWithEvidence: 7,
  stagesDated: 7,
  stagesOnTime: 7,
  ...o,
});

/** A factor's contribution, or «—» when there was nothing to measure it with. */
const contribution = (score: number | null, weight: number) =>
  score === null ? `—/${weight}` : `${Math.round(score * weight)}/${weight}`;

console.log("=".repeat(74));
console.log("A) No history must not produce a number");
console.log("=".repeat(74));
const none = computeTrust([]);
ok(none.score === null, "no seasons -> score is null, not 0 and not 50");
ok(none.band === "new", `band = ${none.bandLabel}`);
console.log(`    ${none.summary}`);

const onlyActive = computeTrust([
  S({ status: "active" }),
  S({ status: "active" }),
]);
ok(
  onlyActive.score === null,
  "seasons in progress but none finished -> still no score",
);
console.log(`    ${onlyActive.summary}`);

console.log("\n" + "=".repeat(74));
console.log("B) A strong record vs a weak one");
console.log("=".repeat(74));
const strong = computeTrust([S(), S(), S(), S()]);
console.log(
  `  strong: ${strong.score}/100 (${strong.bandLabel}), ${strong.completedSeasons} seasons`,
);
for (const f of strong.factors)
  console.log(
    `    ${f.label.padEnd(22)} ${contribution(f.score, f.weight)}  ${f.detail}`,
  );

const weak = computeTrust([
  S({
    stagesWithEvidence: 2,
    stagesOnTime: 2,
    actualCosts: 4000,
    revenue: 1000,
  }),
  S({
    stagesWithEvidence: 1,
    stagesOnTime: 1,
    actualCosts: 3800,
    revenue: 900,
  }),
  S({
    stagesWithEvidence: 3,
    stagesOnTime: 2,
    actualCosts: 3600,
    revenue: 1200,
  }),
  S({ status: "abandoned" }),
]);
console.log(`\n  weak:   ${weak.score}/100 (${weak.bandLabel})`);
for (const f of weak.factors)
  console.log(
    `    ${f.label.padEnd(22)} ${contribution(f.score, f.weight)}  ${f.detail}`,
  );

ok(strong.score! > weak.score!, "a good record scores above a poor one");
ok(
  strong.score! >= 80,
  "a spotless four-season record reaches the trusted band",
);
ok(weak.score! < 60, "a poor record stays below the established band");

console.log("\n" + "=".repeat(74));
console.log("C) Thin history is shrunk toward neutral, not inflated");
console.log("=".repeat(74));
const one = computeTrust([S()]);
const three = computeTrust([S(), S(), S()]);
console.log(`  1 perfect season:  ${one.score}/100  (${one.bandLabel})`);
console.log(`  3 perfect seasons: ${three.score}/100 (${three.bandLabel})`);
ok(
  one.score! < three.score!,
  "one perfect season scores below three perfect seasons",
);
ok(one.score! < 90, "a single season cannot manufacture a near-perfect score");
ok(one.band === "building", "a single season is never labelled trusted");
console.log(`    ${one.summary}`);

console.log("\n" + "=".repeat(74));
console.log("D) Each factor moves the score in the right direction");
console.log("=".repeat(74));
const base = computeTrust([S(), S(), S()]).score!;
const cases: [string, SeasonRecord[]][] = [
  [
    "less evidence",
    [
      S({ stagesWithEvidence: 2 }),
      S({ stagesWithEvidence: 2 }),
      S({ stagesWithEvidence: 2 }),
    ],
  ],
  [
    "late stages",
    [S({ stagesOnTime: 2 }), S({ stagesOnTime: 2 }), S({ stagesOnTime: 2 })],
  ],
  [
    "budget overrun",
    [
      S({ actualCosts: 4800 }),
      S({ actualCosts: 4800 }),
      S({ actualCosts: 4800 }),
    ],
  ],
  [
    "loss-making",
    [S({ revenue: 100 }), S({ revenue: 100 }), S({ revenue: 100 })],
  ],
  ["an abandoned season", [S(), S(), S(), S({ status: "abandoned" })]],
];
for (const [label, rec] of cases) {
  const s = computeTrust(rec).score!;
  ok(s < base, `${label.padEnd(22)} lowers the score (${s} < ${base})`);
}

const underBudget = computeTrust([
  S({ actualCosts: 1800 }),
  S({ actualCosts: 1800 }),
  S({ actualCosts: 1800 }),
]).score!;
ok(underBudget >= base - 0.1, "coming in under budget is not penalised");

console.log("\n" + "=".repeat(74));
console.log("E) Bounds and edge cases");
console.log("=".repeat(74));
let bad = 0;
const variants: SeasonRecord[][] = [
  [
    S({
      stagesTotal: 0,
      stagesCompleted: 0,
      stagesWithEvidence: 0,
      stagesOnTime: 0,
    }),
  ],
  [S({ plannedBudget: 0 })],
  [S({ feddans: 0 })],
  [S({ actualCosts: 0, revenue: 0 })],
  Array.from({ length: 50 }, () => S()),
  [S({ status: "abandoned" }), S({ status: "abandoned" })],
];
for (const v of variants) {
  const t = computeTrust(v);
  if (t.score !== null && (t.score < 0 || t.score > 100 || !isFinite(t.score)))
    bad++;
  for (const f of t.factors)
    if (f.score !== null && (f.score < 0 || f.score > 1 || !isFinite(f.score)))
      bad++;
}
ok(bad === 0, "all scores and factors stay within bounds on edge inputs");

const weights = computeTrust([S()]).factors.reduce((a, f) => a + f.weight, 0);
ok(weights === 100, `weights sum to exactly 100 (got ${weights})`);

console.log("\n" + "=".repeat(74));
console.log("F) What cannot be shown is not asserted — 20260905090000");
console.log("=".repeat(74));

/*
 * Three factors used to award points for the absence of a record rather than
 * for a record. Each one is worth more than it looks: they are the difference
 * between a passport that reports what a farm did and one that rewards farms
 * for filling in less.
 */

const factor = (r: SeasonRecord[], key: string) =>
  computeTrust(r).factors.find((f) => f.key === key)!;

// ١) لا مواعيد: المجهول ليس التزاماً ولا تأخيراً.
const undated = [
  S({ stagesDated: 0, stagesOnTime: 0 }),
  S({ stagesDated: 0, stagesOnTime: 0 }),
  S({ stagesDated: 0, stagesOnTime: 0 }),
];
ok(
  factor(undated, "punctuality").score === null,
  "no dated stages -> punctuality is unmeasured, not a perfect record",
);
const allLate = [
  S({ stagesOnTime: 0 }),
  S({ stagesOnTime: 0 }),
  S({ stagesOnTime: 0 }),
];
ok(
  computeTrust(undated).score! > computeTrust(allLate).score!,
  "and an unmeasured record is not scored as if every stage ran late",
);
ok(
  computeTrust(undated).score! < computeTrust([S(), S(), S()]).score!,
  "nor as if every stage were on time — recording nothing earns nothing",
);
console.log(`    ${computeTrust(undated).summary}`);

// ٢) لا ميزانية مخطّطة: كانت تُمنح خمسة عشر من خمسة عشر.
const noBudget = [
  S({ plannedBudget: 0 }),
  S({ plannedBudget: 0 }),
  S({ plannedBudget: 0 }),
];
ok(
  factor(noBudget, "budget").score === null,
  "no planned budget -> budget control is unmeasured, not full marks",
);

// ٣) لا سجلّ ماليّ: كان الموسم غير المسجَّل يُقرأ خاسراً.
const noLedger = [
  S({ actualCosts: 0, revenue: 0 }),
  S({ actualCosts: 0, revenue: 0 }),
  S({ actualCosts: 0, revenue: 0 }),
];
ok(
  factor(noLedger, "outcome").score === null,
  "no financial record -> outcome is unmeasured, not read as a loss",
);
ok(
  computeTrust(noLedger).score! >
    computeTrust([S({ revenue: 0 }), S({ revenue: 0 }), S({ revenue: 0 })])
      .score!,
  "and an unrecorded season is not scored like a season that lost money",
);

// وإعادة التوزيع تبقى في الحدود، والملخّص يقول ما سقط.
const sparse = computeTrust([
  S({ stagesDated: 0, stagesOnTime: 0, plannedBudget: 0, actualCosts: 0, revenue: 0 }),
  S({ stagesDated: 0, stagesOnTime: 0, plannedBudget: 0, actualCosts: 0, revenue: 0 }),
  S({ stagesDated: 0, stagesOnTime: 0, plannedBudget: 0, actualCosts: 0, revenue: 0 }),
]);
ok(
  sparse.score !== null && sparse.score >= 0 && sparse.score <= 100,
  `three factors dropped still yields a bounded score (${sparse.score})`,
);
ok(
  sparse.summary.includes("لم يدخلها"),
  "and the summary names what was left out of it",
);
console.log(`    ${sparse.summary}`);

/*
 * وهذه المجموعةُ وُلدت من عطبٍ في الإصلاح نفسِه.
 *
 * Renormalising over the measured factors alone made a sparse record score
 * 82.2 and read «سجل موثوق» — better than the bug it replaced, because the
 * factors that dropped out were the ones that would have cost points. These
 * checks exist so that particular cure cannot come back.
 */
const full = computeTrust([S(), S(), S()]);
ok(
  sparse.score! < full.score!,
  `recording less scores lower, never higher (${sparse.score} < ${full.score})`,
);
ok(
  sparse.band !== "trusted",
  `a record missing three factors is never labelled «موثوق» (got «${sparse.bandLabel}»)`,
);

// وحتى السجلُّ الكاملُ في كلّ ما قِيس لا يُوسَم موثوقاً وفيه عاملٌ لم يُقَس.
const oneMissing = computeTrust([
  S({ plannedBudget: 0 }),
  S({ plannedBudget: 0 }),
  S({ plannedBudget: 0 }),
  S({ plannedBudget: 0 }),
]);
ok(
  oneMissing.band !== "trusted",
  `one unmeasured factor blocks the trusted band (got «${oneMissing.bandLabel}» at ${oneMissing.score})`,
);
ok(
  computeTrust([S(), S(), S(), S()]).band === "trusted",
  "and a complete, spotless record still reaches it",
);

// والدليلُ بلا ملفّ لا يُحسب توثيقاً — وهو شرطُ الزناد نفسُه.
ok(
  factor([S({ stagesWithEvidence: 0 })], "evidence").score === 0,
  "stages documented by note alone score zero for evidence discipline",
);
ok(
  factor([S()], "evidence").detail.includes("ملفّ مرفوع"),
  "and the wording says a file, not merely «evidence»",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
