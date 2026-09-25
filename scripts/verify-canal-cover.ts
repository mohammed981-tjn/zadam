/**
 * Checks the helpers behind the corridor's land cover and groundwater data,
 * and that the committed land cover file is whole and sensible.
 */
import { kmToRoute, mode, shares } from "./fetch-canal-landcover";
import { pointsIn, zipLinks } from "./fetch-canal-groundwater";
import { LAND_COVER, coverInfo } from "../src/lib/canalMap";
import { ROUTE } from "../src/lib/arcCanal";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nالحساب:");
ok(mode([60, 60, 40, 0, 0, 0]) === 60, "الأغلب يُختار، والصفر (بلا بيانات) لا يُعدّ");
ok(mode([0, 0]) === null, "ولا صنف حين لا بيانات");
const s = shares([40, 60, 60, 60, 0]);
ok(s.length === 2 && s[0].pct === 75 && s[1].pct === 25, "والنِّسب من المعروف وحده");
ok(s[0].cls === 60, "مرتّبةً من الأكبر لا بالرقم");
ok(kmToRoute(ROUTE[10].lon, ROUTE[10].lat) < 0.01, "نقطةٌ على المسار بعدها صفر");
ok(Math.abs(kmToRoute(ROUTE[20].lon - 0.1, ROUTE[20].lat) - 10.7) < 0.3, "وعُشر درجةٍ غرباً نحو ١١ كم");

console.log("\nالمياه الجوفية:");
const links = zipLinks('<a href="downloads/dtw.zip">x</a> <a href=\'https://a.b/c/prod.ZIP\'>y</a> <a href="p.pdf">', "https://www2.bgs.ac.uk/g/page.html");
ok(links.length === 2 && links[0] === "https://www2.bgs.ac.uk/g/downloads/dtw.zip", "روابط الملفات المضغوطة تُستخرج وتُكمَّل");
const pts = pointsIn("X Y DTW\n32.3 15.5 3\n32.3,15.5,4\n10 10 1\n500000 1700000 2\n");
ok(pts.length === 2 && pts[0].v === "3", "ونقاط الإطار وحدها تُحفظ، بالمسافة أو بالفاصلة");

console.log("\nملف الغطاء الأرضي:");
const strip = LAND_COVER.shares.strip.reduce((a, s) => a + s.pct, 0);
ok(Math.abs(strip - 100) < 1, `نِسب الشريط تجمع ١٠٠ (${strip})`);
ok(LAND_COVER.rows.every((r) => Math.abs(r.runs.reduce((a, [, n]) => a + n, 0) * LAND_COVER.block - 0.65) < 0.02), "وكلّ صفٍّ يغطّي عرض الإطار");
ok(LAND_COVER.along.at(-1)!.toKm > 90, "والخطّ مغطّى إلى آخره");
ok(LAND_COVER.shares.strip.every((s, i, a) => i === 0 || a[i - 1].pct >= s.pct), "مرتّبةً من الأكبر في الملف");
ok(LAND_COVER.shares.corridor.map((s) => s.cls).every((c) => coverInfo(c)?.ar && !coverInfo(c)!.ar.startsWith("صنف")), "ولكلّ صنفٍ اسمٌ عربيّ");

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
