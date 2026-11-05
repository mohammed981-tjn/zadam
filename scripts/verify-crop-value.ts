/**
 * The standing crop's estimated value: shown on the season page, never booked (owner, 6 November 2026).
 *
 *   npx tsx scripts/verify-crop-value.ts
 */
import { readFileSync } from "node:fs";
import { boursePriceFor, standingCropValue } from "../src/lib/cropValue";
import type { PriceSeries } from "../src/lib/marketCrops";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-6;

const src = "https://example.org/x";
const series: PriceSeries[] = [
  { market: "gedaref", crop: "sesame", unit: "qintar", history: [{ date: "2026-10-10", price: 450_000, source: src }, { date: "2026-10-13", price: 540_000, source: src }] },
  { market: "obeid", crop: "sesame_red", unit: "qintar", history: [{ date: "2026-10-14", price: 450_000, source: src }] },
  { market: "gedaref", crop: "millet", unit: "ardeb", history: [{ date: "2026-10-20", price: 1_140_000, source: src }] },
];

const b = boursePriceFor("sesame", series)!;
ok(b.crop === "sesame_red" && b.date === "2026-10-14" && near(b.poundsPerKg, 10_000), "the newest qintar figure for the crop: 450,000 a qintar is 10,000 pounds a kg");
ok(boursePriceFor("millet", series) === null, "the ardeb weighs differently per crop, so millet gets no bourse price");
ok(boursePriceFor("tomato", series) === null, "a crop no bourse quotes gets none");

// 10 feddans, Sudan's sesame at 400 kg/ha: 10 × 400 × 0.4201 = 1,680.4 kg.
const v1 = standingCropValue({ feddans: 10, sudanKgPerHa: 400, yieldYear: 2024, bourse: b, faostat: null, poundsPerDollar: 4_000 })!;
ok(near(v1.kg, 1680.4) && near(v1.kgPerFeddan, 168.04), "expected harvest: feddans × national yield × hectares per feddan");
ok(v1.basis === "bourse" && near(v1.pounds, 16_804_000) && near(v1.usd, 4201), "priced at the bourse, in pounds and in dollars at the given rate");

const noRate = standingCropValue({ feddans: 10, sudanKgPerHa: 400, yieldYear: 2024, bourse: b, faostat: null, poundsPerDollar: null })!;
ok(noRate.usd === null && noRate.pounds != null, "no rate: the pounds stand, the dollars are not guessed");

const fao = { usdPerTonne: 1_500, basis: "sudan_export" as const, year: 2023 };
const v2 = standingCropValue({ feddans: 10, sudanKgPerHa: 400, yieldYear: 2024, bourse: null, faostat: fao, poundsPerDollar: 4_000 })!;
ok(v2.basis === "sudan_export" && near(v2.usd, 2520.6) && near(v2.pounds, 10_082_400) && v2.priceWhen === "2023", "no bourse figure: FAOSTAT's price per tonne, labelled with its basis and year");

ok(standingCropValue({ feddans: 10, sudanKgPerHa: null, yieldYear: null, bourse: b, faostat: fao, poundsPerDollar: 4_000 }) === null, "no national yield: no estimate");
ok(standingCropValue({ feddans: 10, sudanKgPerHa: 400, yieldYear: 2024, bourse: null, faostat: { usdPerTonne: null, basis: "none", year: null }, poundsPerDollar: 4_000 }) === null, "no price anywhere: no estimate");
ok(standingCropValue({ feddans: 0, sudanKgPerHa: 400, yieldYear: 2024, bourse: b, faostat: fao, poundsPerDollar: 4_000 }) === null, "no area: no estimate");

// The estimate is shown, never booked: nothing in the module writes, and the season page does not hand it to an action.
const lib = readFileSync("src/lib/cropValue.ts", "utf8");
ok(!/supabase|rpc\(|from\("/.test(lib), "the estimate module reads nothing and writes nothing");

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
