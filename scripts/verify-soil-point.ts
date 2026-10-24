/**
 * تربة نقطة الأرض (البند ١٨٠): قارئ SoilGrids على ما أجابت به الخدمة فعلاً، والعبارات التي تُكتب
 * بجانب الصنف، وما يحدث حين تتعذّر الخدمة.
 *
 *   npx tsx scripts/verify-soil-point.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOIL_CONFIDENT_FROM, fetchSoilAtPoint, parseSoilGridsClassification, soilEstimateWords } from "../src/lib/soilPoint";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, "fixtures/soil-point", `${name}.json`), "utf8"));

console.log("What SoilGrids answered for six places in Sudan");
const khartoum = parseSoilGridsClassification(fixture("khartoum-nile-valley"));
eq(khartoum, { wrb: "Vertisols", probability: 22, alternatives: [{ wrb: "Solonetz", probability: 17 }, { wrb: "Arenosols", probability: 15 }] },
  "Khartoum on the Nile: Vertisols at only 22 %, with the two groups behind it");
eq(parseSoilGridsClassification(fixture("gezira-clay-plain"))?.probability, 74, "the Gezira clay plain: 74 %");
eq(parseSoilGridsClassification(fixture("gedaref"))?.wrb, "Vertisols", "Gedaref");
eq(parseSoilGridsClassification(fixture("north-kordofan-qoz"))?.wrb, "Luvisols", "North Kordofan: a three-way tie is still named by SoilGrids");
eq(parseSoilGridsClassification(fixture("wadi-halfa"))?.wrb, "Leptosols", "Wadi Halfa");
eq(parseSoilGridsClassification(fixture("red-sea-hills"))?.probability, 36, "the Red Sea hills: 36 %");

console.log("\nWhat is refused");
eq(parseSoilGridsClassification(null), null, "nothing");
eq(parseSoilGridsClassification({}), null, "an empty answer");
eq(parseSoilGridsClassification({ wrb_class_name: "No information available", wrb_class_probability: [] }), null, "a pixel with no information");
eq(parseSoilGridsClassification({ wrb_class_name: "Vertisols", wrb_class_probability: "x" }), null, "probabilities that are not a list");
eq(parseSoilGridsClassification({ wrb_class_name: "Vertisols", wrb_class_probability: [["Solonetz", 17]] }), null, "a top group with no probability of its own");
eq(parseSoilGridsClassification({ wrb_class_name: "vertisols", wrb_class_probability: [["vertisols", 50]] }), null, "a name that is not a group");
eq(parseSoilGridsClassification({ wrb_class_name: "Vertisols", wrb_class_probability: [["Vertisols", 150]] }), null, "a probability over 100");
eq(parseSoilGridsClassification({ wrb_class_name: "Vertisols", wrb_class_probability: [["Vertisols", 40.6]] })?.probability, 41, "a fractional probability is rounded");

async function whenUnreadable() {
  console.log("\nWhen the service cannot be read");
  const answer = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  eq(await fetchSoilAtPoint(32.53, 15.6, { fetchImpl: answer(200, fixture("khartoum-nile-valley")) }), khartoum, "a good answer is read");
  eq(await fetchSoilAtPoint(32.53, 15.6, { fetchImpl: answer(429, { detail: "Too many requests" }) }), null, "the rate limit (429) gives nothing");
  eq(await fetchSoilAtPoint(32.53, 15.6, { fetchImpl: answer(500, {}) }), null, "a server error gives nothing");
  eq(await fetchSoilAtPoint(32.53, 15.6, { fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch }), null, "a network failure gives nothing, and does not throw");
  eq(await fetchSoilAtPoint(32.53, 15.6, { fetchImpl: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch }), null, "an answer that is not JSON gives nothing");
  eq(await fetchSoilAtPoint(Number.NaN, 15.6), null, "no coordinates, no request");
  eq(await fetchSoilAtPoint(32.53, 95), null, "a latitude off the earth, no request");
  let asked = "";
  await fetchSoilAtPoint(32.5312345, 15.6098765, { fetchImpl: (async (u: string) => { asked = String(u); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch });
  eq(asked, "https://rest.isric.org/soilgrids/v2.0/classification/query?lon=32.5312&lat=15.6099&number_classes=3", "the request carries the point to four decimals, and asks for three groups");

}

console.log("\nWhat is said beside the class");
const t = (ar: string) => ar;
eq(soilEstimateWords("point", 74, t), { label: "التربة (تقدير من الأقمار لموقع الأرض)", confidence: "احتمال 74٪" }, "a confident reading of the land's point");
eq(soilEstimateWords("point", 22, t).confidence, "غير مؤكّد — احتمال 22٪ فقط", "a weak one says so, with the number");
eq(soilEstimateWords("point", SOIL_CONFIDENT_FROM, t).confidence, `احتمال ${SOIL_CONFIDENT_FROM}٪`, "exactly at the line counts as confident");
eq(soilEstimateWords("point", SOIL_CONFIDENT_FROM - 1, t).confidence?.startsWith("غير مؤكّد"), true, "one under it does not");
eq(soilEstimateWords(null, null, t), { label: "التربة (تقدير للمنطقة، لا للحقل)", confidence: null }, "a class with no source is the area's, not the field's");
eq(soilEstimateWords("point", null, t).confidence, null, "a reading with no probability says no number");

whenUnreadable().then(() => {
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK");
});
