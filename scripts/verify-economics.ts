/**
 * Checks the economics reference and its loss arithmetic.
 *
 * The facts in lib/economics.ts are quotations, and the thing worth asserting
 * about a quotation is that it still carries its source — a figure that loses
 * its attribution during an edit becomes indistinguishable from one somebody
 * made up. The arithmetic below it is checked the ordinary way.
 */

import {
  ECONOMIC_FACTS,
  factsFor,
  lossValue,
  storageGain,
} from "../src/lib/economics";

let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${detail}`);
}

console.log("\nEvery fact keeps its attribution");
{
  check("no duplicate keys",
    new Set(ECONOMIC_FACTS.map((f) => f.key)).size === ECONOMIC_FACTS.length,
    `${ECONOMIC_FACTS.length} facts`);
  check("every fact names a source",
    ECONOMIC_FACTS.every((f) => f.source.trim().length > 8));
  check("every fact carries a year or period",
    ECONOMIC_FACTS.every((f) => f.year.trim().length > 0));
  check("every fact has a headline and a detail",
    ECONOMIC_FACTS.every(
      (f) => f.headline.trim().length > 15 && f.detail.trim().length > 40));
  check("all three areas are covered",
    (["livestock", "postharvest", "risk"] as const).every(
      (a) => factsFor(a).length > 0),
    `livestock ${factsFor("livestock").length}, postharvest ${factsFor("postharvest").length}, risk ${factsFor("risk").length}`);
}

console.log("\nLoss arithmetic");
{
  const r = lossValue(1_000_000, 0.3)!;
  check("30% of a million is lost", Math.abs(r.lost - 300_000) < 1e-6, `${r.lost}`);
  check("and the rest is retained",
    Math.abs(r.retained - 700_000) < 1e-6, `${r.retained}`);
  check("lost + retained equals the harvest",
    Math.abs(r.lost + r.retained - 1_000_000) < 1e-6);

  const none = lossValue(1_000_000, 0)!;
  check("a zero loss rate loses nothing", none.lost === 0);
}

console.log("\nStorage gain: the published 30% → 2% improvement");
{
  const g = storageGain(1_000_000, 0.3, 0.02)!;
  check("saves 28% of the harvest's value",
    Math.abs(g.saved - 280_000) < 1e-6, `${g.saved}`);
  check("share preserved matches the difference in rates",
    Math.abs(g.sharePreserved - 0.28) < 1e-9,
    `${(g.sharePreserved * 100).toFixed(1)}%`);

  // The direction matters: a "gain" that made things worse would still be a
  // positive number if the subtraction were the other way round.
  check("an improvement that is worse than the status quo is refused",
    storageGain(1_000_000, 0.02, 0.3) === null);
  check("no improvement yields no saving",
    storageGain(1_000_000, 0.3, 0.3)!.saved === 0);
}

console.log("\nRejections");
{
  check("a negative harvest is refused", lossValue(-5, 0.3) === null);
  check("a zero harvest is refused", lossValue(0, 0.3) === null);
  check("a loss rate above 1 is refused", lossValue(100, 1.5) === null);
  check("a negative loss rate is refused", lossValue(100, -0.1) === null);
  check("NaN is refused", lossValue(Number.NaN, 0.3) === null);
}

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
