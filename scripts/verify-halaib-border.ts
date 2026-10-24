/**
 * مثلث حلايب على الخريطة الحيّة (البند ١٧٤): خطّ السودان حوله مرسوم، والخطّ المتقطّع
 * الذي يفصله عنه مخفيّ، وما سوى ذلك من حدود العالم كما هو.
 *
 *   npx tsx scripts/verify-halaib-border.ts
 *
 * The style here is a small copy of the shape OpenFreeMap's «liberty» has (read on 24 October):
 * boundary_3, boundary_2 and boundary_disputed over the openmaptiles source. The real style is
 * proved by .github/workflows/map-sources.yml, which fetches it and a tile.
 */
import type { StyleSpecification } from "maplibre-gl";
import { withHalaibInSudan } from "../src/lib/mapStyle";
import { HALAIB_BORDER, SUDAN_BORDER, insideSudan } from "../src/lib/rainMap";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const liberty = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    {
      id: "boundary_3", type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 5,
      filter: ["all", [">=", ["get", "admin_level"], 3], ["!=", ["get", "disputed"], 1]],
      paint: { "line-color": "hsl(0,0%,70%)" },
    },
    {
      id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1], ["!", ["has", "claimed_by"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "hsl(248,1%,41%)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 12, 3] },
    },
    {
      id: "boundary_disputed", type: "line", source: "openmaptiles", "source-layer": "boundary",
      filter: ["all", ["!=", ["get", "maritime"], 1], ["==", ["get", "disputed"], 1]],
      paint: { "line-color": "hsl(248,1%,41%)", "line-dasharray": [1, 2] },
    },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name"] } },
  ],
} as unknown as StyleSpecification;

const out = withHalaibInSudan(liberty);
const ids = out.layers.map((l) => l.id);
console.log("\nأ) الحدود حول حلايب");
ok(ids.includes("boundary_sudan_halaib"), "طبقةُ خطّ السودان حول المثلث مضافة");
ok(ids.indexOf("boundary_sudan_halaib") < ids.indexOf("boundary_disputed"), "وتسبق الطبقة المتقطّعة");
ok(ids.indexOf("boundary_sudan_halaib") > ids.indexOf("boundary_2"), "وتلي حدود الدول، فتبدو منها");
const src = (out.sources as Record<string, { data?: GeoJSON.Feature<GeoJSON.LineString> }>).sudan_halaib;
const line = src?.data?.geometry.coordinates ?? [];
ok(line.length >= 8, `والخطّ ${line.length} نقطة، من حدود السودان نفسها`);
ok(line[0]?.[0] === 34.08 && line[0]?.[1] === 22, "يبدأ حيث ينتهي خطّ ٢٢° عند 34.08");
ok(line[line.length - 1]?.[0] === 36.89, "وينتهي عند ساحل البحر الأحمر");
ok(HALAIB_BORDER.length === line.length, "وهو ما في `rainMap.ts` لا نسخةٌ أخرى");
ok(
  (out.layers.find((l) => l.id === "boundary_sudan_halaib") as { paint?: unknown }).paint ===
    (liberty.layers.find((l) => l.id === "boundary_2") as { paint?: unknown }).paint,
  "بلون الحدود وعرضها نفسيهما",
);

console.log("\nب) الخطّ المتقطّع");
const dashed = JSON.stringify((out.layers.find((l) => l.id === "boundary_disputed") as { filter?: unknown }).filter);
ok(dashed.includes('"disputed_name"') && dashed.includes("حلايب"), "المتقطّع يستثني ما اسمه فيه «حلايب»");
ok(dashed.includes('["==",["get","disputed"],1]'), "ويبقى شرطُه الأصليّ كما هو");

console.log("\nج) وما سوى ذلك لم يُمسّ");
for (const id of ["background", "boundary_3", "boundary_2", "label_city"]) {
  ok(JSON.stringify(out.layers.find((l) => l.id === id)) === JSON.stringify(liberty.layers.find((l) => l.id === id)), `الطبقة ${id} كما هي`);
}
ok(withHalaibInSudan({ ...liberty, layers: liberty.layers.filter((l) => l.id !== "boundary_disputed") } as StyleSpecification).layers.length === liberty.layers.length - 1,
  "وإن غاب المتقطّع من الأسلوب لم يُضَف شيء");

console.log("\nد) والنقطة نفسها");
ok(insideSudan([36.64, 22.22]), "حلايب (36.64، 22.22) داخل حدود السودان");
ok(insideSudan([34.5, 22.1]), "ونقطةٌ عند حافّة المثلث الجنوبيّة (34.5، 22.1) داخلةٌ كذلك");
ok(SUDAN_BORDER.length > line.length, "والخطّ جزءٌ من حدود السودان لا بديلٌ عنها");

if (failed) {
  console.error(`\nفشل ${failed} فحصاً.`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED — حلايب داخل السودان بلا خطٍّ يفصلها");
