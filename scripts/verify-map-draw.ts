/**
 * Checks the drawing behind the national map: the ground data is whole, the
 * interpolation is right, and the bands are the ones the values fall in.
 */
import { BASE, MAP_LABELS, NEIGHBOUR_LABELS, clipToSudan, coarseField, isobands, sample, townValues } from "../src/lib/mapDraw";
import { RAIN_CELLS, insideSudan, layerFor, type GridCell } from "../src/lib/rainMap";
import { simplify, clipRing } from "./build-sudan-base";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const cells = (f: (c: (typeof RAIN_CELLS)[number]) => number): GridCell[] =>
  RAIN_CELLS.map((c) => ({ ...c, rainMm: f(c), et0Mm: 0, tmaxC: 30, elevM: null, soil: null, lands: null }));

console.log("\nالأساس:");
ok(BASE.neighbours.length >= 7, `الجيران مرسومون (${BASE.neighbours.length})`);
ok(BASE.rivers.some((r) => r.name === "النيل" && r.main), "والنيل");
ok(BASE.rivers.some((r) => r.name === "النيل الأزرق") && BASE.rivers.some((r) => r.name === "النيل الأبيض"), "وفرعاه");
ok(BASE.lakes.some((l) => /ناصر/.test(l.name)), "وبحيرة ناصر");
ok(BASE.states.length >= 17, `والولايات (${BASE.states.length})`);
ok(MAP_LABELS.every((t) => insideSudan([t.lon, t.lat])), "وكلّ مدينةٍ معلَّمة داخل الحدود");
ok(NEIGHBOUR_LABELS.every((t) => !insideSudan([t.lon, t.lat])), "وأسماء الجيران خارجها");
ok(simplify([[0, 0], [1, 1], [2, 0], [0, 0]]).length === 4, "والحلقة المغلقة لا تنطوي إلى نقطتين");
ok(clipRing([[0, 0], [1, 0], [1, 1]]).length === 0, "وما خارج الإطار يُقصّ كلّه");

console.log("\nالاستيفاء:");
const flat = coarseField(cells(() => 7), (c) => c.rainMm)!;
ok(Math.abs(sample(flat, 30, 15) - 7) < 1e-9, "حقلٌ ثابت يبقى ثابتاً");
ok(Math.abs(sample(flat, 21.8, 23.4) - 7) < 1e-9, "وحتى في ركنٍ بلا مربّع (يُملأ من الأقرب)");
const ramp = coarseField(cells((c) => c.lat), (c) => c.rainMm)!;
ok(Math.abs(sample(ramp, 30, 14) - 14) < 0.01, "والتدرّج الخطّي يُستوفى على حاله");

console.log("\nالنطاقات:");
const rain = layerFor("rain");
const dry = isobands(cells(() => 0), rain)!;
ok(dry.base === 0 && dry.bands.length === 0, "بلا مطر: لونٌ واحد ولا نطاقات");
const wet = isobands(cells((c) => (c.lat < 12 ? 70 : 2)), rain)!;
ok(wet.base === 1, "أدنى قيمةٍ ٢ مم ← الأساس نطاق ١–٥");
ok(wet.bands.map((b) => b.band).join() === "2,3,4,5", "وفوقه النطاقات حتى ٦٠ فأكثر");
ok(
  wet.bands.at(-1)!.shapes.flat(2).every(([, lat]) => lat < 13.5),
  "وأعلاها في الجنوب وحده",
);

// The live map (البند ١٤٧) cannot clip to the border, so it asks for bands
// that stop one step past it. Wet in the north: unclipped, the top band runs
// to the frame (Egypt, Libya); clipped, it stays within a degree of Sudan —
// the step past the border, and the Halaib triangle's northern tip, which
// comes within that of the frame.
console.log("\nالخريطة الحيّة:");
const soaked = cells((c) => (c.lat > 12 ? 70 : 2));
const near = ([lon, lat]: number[]) =>
  [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => insideSudan([lon + dx, lat + dy])));
const open = isobands(soaked, rain)!.bands.at(-1)!.shapes.flat(2);
const cut = isobands(soaked, rain, true)!.bands.at(-1)!.shapes.flat(2);
ok(open.some((p) => !near(p)), "بلا قصّ: النطاق يبلغ إطار الخريطة خارج السودان");
ok(cut.length > 0 && cut.every(near), "وبالقصّ: يقف عند الحدود، في درجةٍ منها");
ok(isobands(soaked, rain, true)!.base === isobands(soaked, rain)!.base, "والأساس هو هو");
const hot = cells(() => 0).map((c) => ({ ...c, tmaxC: c.lat > 20 ? 45 : 33 }));
ok(
  isobands(hot, layerFor("tmax"), true)!.bands.every((b) => b.shapes.flat(2).every(near)),
  "وكذلك الحرارة: لا شيء منها فوق مصر",
);

// Then cut at the border itself, since the live map shows the countries
// around Sudan as they are (the owner, 24 October): nothing past it, to
// rounding, and the band still covers the wet north.
const onBorder = ([lon, lat]: number[]) =>
  [-0.01, 0, 0.01].some((dx) => [-0.01, 0, 0.01].some((dy) => insideSudan([lon + dx, lat + dy])));
const exact = clipToSudan(isobands(soaked, rain, true)!.bands.at(-1)!.shapes);
ok(exact.length > 0 && exact.flat(2).every(onBorder), "ثمّ يُقصّ عند الحدود بالضبط: لا نقطة خارجها");
ok(insideSudan([30, 19]) && exact.some((poly) => insideSudan([30, 19], poly[0])), "ويبقى يغطّي الشمال المبتلّ");
ok(clipToSudan([]).length === 0, "ولا شيء يُقصّ إلى لا شيء");

console.log("\nالمدن:");
const tv = townValues(cells((c) => c.lat), rain);
const k = tv.find((t) => t.name === "الخرطوم")!;
ok(Math.abs(k.value! - 15.6) < 0.2, `قيمة الخرطوم من الحقل (${k.value!.toFixed(1)})`);
ok(townValues(cells(() => 1), layerFor("lands")).every((t) => t.value == null), "وطبقة الأراضي لا تكتب رقماً عند المدن");

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
