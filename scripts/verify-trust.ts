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
  stagesOnTime: 7,
  ...o,
});

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
    `    ${f.label.padEnd(22)} ${Math.round(f.score * f.weight)}/${f.weight}  ${f.detail}`,
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
    `    ${f.label.padEnd(22)} ${Math.round(f.score * f.weight)}/${f.weight}  ${f.detail}`,
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
    if (f.score < 0 || f.score > 1 || !isFinite(f.score)) bad++;
}
ok(bad === 0, "all scores and factors stay within bounds on edge inputs");

const weights = computeTrust([S()]).factors.reduce((a, f) => a + f.weight, 0);
ok(weights === 100, `weights sum to exactly 100 (got ${weights})`);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
