import {
  assessProvenance,
  fineGold,
  type CustodyEvent,
  type SiteFacts,
} from "../src/lib/provenance";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const goodSite: SiteFacts = {
  licensed: true,
  hasCoordinates: true,
  armedPresence: false,
  childLabour: false,
  siteVisited: true,
};

const E = (
  seq: number,
  from: string,
  to: string,
  day: number,
  g: number,
  fine: number,
  ev = 2,
): CustodyEvent => ({
  sequence: seq,
  fromParty: from,
  toParty: to,
  role: "transporter",
  occurredAt: `2026-03-${String(day).padStart(2, "0")}`,
  weightGrams: g,
  fineness: fine,
  evidenceCount: ev,
});

// A clean chain. Fine gold must fall at every hop: refining removes
// impurities, it never creates metal.
//   100g x 0.80  = 80.00 g fine
//    82g x 0.96  = 78.72 g fine   (refining loss)
//    78g x 0.995 = 77.61 g fine   (further loss)
const cleanChain = [
  E(1, "أحمد المعدّن", "ورشة النيل", 2, 100, 0.8),
  E(2, "ورشة النيل", "ناقل معتمد", 5, 82, 0.96),
  E(3, "ناقل معتمد", "مخزن الخرطوم", 7, 78, 0.995),
];

console.log("=".repeat(76));
console.log("A) A fully documented, mercury-free, unbroken chain");
console.log("=".repeat(76));
const clean = assessProvenance(goodSite, "borax", cleanChain);
console.log(
  `  score ${clean.score}/100  chainIntact=${clean.chainIntact}  flags=${clean.flags.length}`,
);
console.log(
  `  fine gold trail: ${clean.fineGoldTrail.map((v) => v.toFixed(1)).join(" -> ")} g`,
);
ok(clean.chainIntact, "chain reported intact");
ok(clean.flags.length === 0, "no flags raised");
ok(clean.score >= 90, "scores high");
ok(clean.mercuryFree, "recorded as mercury-free");

console.log("\n" + "=".repeat(76));
console.log("B) MASS BALANCE — the check that catches laundering");
console.log("=".repeat(76));
// Gold appears from nowhere between hop 2 and 3: 78.7g of fine gold becomes 99.5g
const laundered = [
  E(1, "أحمد المعدّن", "ورشة النيل", 2, 100, 0.8),
  E(2, "ورشة النيل", "ناقل", 5, 82, 0.96),
  E(3, "ناقل", "مخزن", 7, 100, 0.995),
];
const bad = assessProvenance(goodSite, "borax", laundered);
console.log(
  `  trail: ${bad.fineGoldTrail.map((v) => v.toFixed(1)).join(" -> ")} g`,
);
const massFlag = bad.flags.find((f) => f.key.startsWith("mass_"));
ok(!!massFlag, "mass increase detected");
console.log(`    -> ${massFlag?.message}`);
ok(massFlag?.severity === "critical", "flagged critical");
ok(!bad.chainIntact, "chain marked broken");
ok(
  bad.score <= 25,
  `score capped at 25 despite perfect paperwork (got ${bad.score})`,
);

console.log("\n  refining losses must NOT be flagged:");
const lossy = [E(1, "أ", "ب", 2, 100, 0.8), E(2, "ب", "ج", 5, 70, 0.99)];
ok(
  !assessProvenance(goodSite, "borax", lossy).flags.some((f) =>
    f.key.startsWith("mass_"),
  ),
  "a large legitimate refining loss raises no mass flag",
);

console.log("\n" + "=".repeat(76));
console.log("C) Chain continuity and ordering");
console.log("=".repeat(76));
const brokenLink = [
  E(1, "أحمد", "ورشة النيل", 2, 100, 0.8),
  E(2, "شخص مجهول", "ناقل", 5, 82, 0.96),
];
const bl = assessProvenance(goodSite, "borax", brokenLink);
const breakFlag = bl.flags.find((f) => f.key.startsWith("break_"));
ok(!!breakFlag, "handover to a party who never received it is caught");
console.log(`    -> ${breakFlag?.message}`);

const backwards = [E(1, "أ", "ب", 10, 100, 0.8), E(2, "ب", "ج", 3, 90, 0.9)];
ok(
  assessProvenance(goodSite, "borax", backwards).flags.some((f) =>
    f.key.startsWith("time_"),
  ),
  "an event dated before the one preceding it is caught",
);

ok(
  assessProvenance(goodSite, "borax", []).flags.some(
    (f) => f.key === "no_custody",
  ),
  "an empty chain is called out, not silently scored",
);

console.log("\n" + "=".repeat(76));
console.log("D) OECD red flags at the origin");
console.log("=".repeat(76));
const armed = assessProvenance(
  { ...goodSite, armedPresence: true },
  "borax",
  cleanChain,
);
ok(
  armed.flags.some(
    (f) => f.key === "armed_presence" && f.severity === "critical",
  ),
  "armed presence is critical",
);
ok(
  armed.score <= 25,
  `armed presence caps the score whatever else is perfect (got ${armed.score})`,
);
console.log(
  `    -> ${armed.flags.find((f) => f.key === "armed_presence")?.message.slice(0, 80)}...`,
);

const child = assessProvenance(
  { ...goodSite, childLabour: true },
  "borax",
  cleanChain,
);
ok(
  child.flags.some(
    (f) => f.key === "child_labour" && f.severity === "critical",
  ),
  "child labour is critical",
);
ok(child.score <= 25, "child labour caps the score");

ok(
  assessProvenance(
    { ...goodSite, licensed: false },
    "borax",
    cleanChain,
  ).flags.some((f) => f.key === "unlicensed"),
  "unlicensed site flagged",
);
ok(
  assessProvenance(
    { ...goodSite, hasCoordinates: false },
    "borax",
    cleanChain,
  ).flags.some((f) => f.key === "no_coordinates"),
  "missing coordinates flagged",
);

console.log("\n" + "=".repeat(76));
console.log("E) Processing method");
console.log("=".repeat(76));
const merc = assessProvenance(goodSite, "mercury", cleanChain);
ok(!merc.mercuryFree, "mercury lot not marked mercury-free");
ok(
  merc.flags.some((f) => f.key === "mercury"),
  "mercury use flagged",
);
ok(
  merc.score < clean.score,
  `mercury scores below borax (${merc.score} < ${clean.score})`,
);
ok(
  assessProvenance(goodSite, "unknown", cleanChain).flags.some(
    (f) => f.key === "method_unknown",
  ),
  "unrecorded method flagged",
);
ok(
  assessProvenance(goodSite, "gravity", cleanChain).mercuryFree,
  "gravity-only counts as mercury-free",
);

console.log("\n" + "=".repeat(76));
console.log("F) Bounds and arithmetic");
console.log("=".repeat(76));
ok(Math.abs(fineGold(100, 0.8) - 80) < 1e-9, "fine gold = weight x fineness");
ok(fineGold(100, 5) === 100, "fineness above 1 is clamped");
ok(fineGold(100, -1) === 0, "negative fineness is clamped");

let bounds = 0,
  n = 0;
for (const lic of [true, false])
  for (const co of [true, false])
    for (const armedP of [true, false])
      for (const cl of [true, false])
        for (const vis of [true, false])
          for (const m of [
            "gravity",
            "borax",
            "mercury",
            "cyanide",
            "unknown",
          ] as const) {
            const r = assessProvenance(
              {
                licensed: lic,
                hasCoordinates: co,
                armedPresence: armedP,
                childLabour: cl,
                siteVisited: vis,
              },
              m,
              cleanChain,
            );
            n++;
            if (r.score < 0 || r.score > 100 || !isFinite(r.score)) bounds++;
          }
ok(bounds === 0, `${n} combinations, all scores within 0-100`);

const evidenceless = assessProvenance(
  goodSite,
  "borax",
  cleanChain.map((e) => ({ ...e, evidenceCount: 0 })),
);
ok(
  evidenceless.flags.filter((f) => f.key.startsWith("evidence_")).length === 3,
  "every undocumented hop is named",
);
ok(evidenceless.score < clean.score, "missing evidence lowers the score");

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
