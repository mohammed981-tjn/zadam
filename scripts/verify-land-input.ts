/**
 * «حدّد أرضك» (البند ١٣٤): المساحة والمركز من الأركان، وأقرب محطّة، والفحص الذي يشترك فيه الموقع والتطبيق.
 *
 *   npx tsx scripts/verify-land-input.ts
 */
import { readFileSync } from "node:fs";
import { M2_PER_FEDDAN, boundaryOf, landInputProblem, nearestStation, MAX_CORNERS, TENURES } from "../src/lib/landInput";
import { SUDAN_STATES } from "../src/lib/nafir";
import { WATER_SOURCE_LABEL } from "../src/lib/risk";

let failed = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) failed++;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// A square of 100 m a side near Wad Madani: 10,000 m², 2.38 feddans.
const LAT = 14.4;
const LNG = 33.52;
const dLat = 100 / 111_195;
const dLng = 100 / (111_195 * Math.cos((LAT * Math.PI) / 180));
const square = [
  { lat: LAT, lng: LNG },
  { lat: LAT, lng: LNG + dLng },
  { lat: LAT + dLat, lng: LNG + dLng },
  { lat: LAT + dLat, lng: LNG },
];

console.log("\nأ) المساحة والمركز");
const sq = boundaryOf(square)!;
ok(sq !== null && near(sq.m2, 10_000, 20), `مربّع ١٠٠ م: ${sq?.m2.toFixed(0)} م² (≈ ١٠٬٠٠٠)`);
ok(near(sq.feddans, 10_000 / M2_PER_FEDDAN, 0.01), `= ${sq.feddans.toFixed(2)} فدان`);
ok(near(sq.centre.lat, LAT + dLat / 2, 1e-7) && near(sq.centre.lng, LNG + dLng / 2, 1e-7), "ومركزه وسط المربّع");
ok(near(boundaryOf([...square].reverse())!.m2, sq.m2, 1e-6), "والاتّجاه لا يغيّر المساحة (مع عقارب الساعة أو عكسها)");

// An L: two squares side by side and one on top, 30,000 m²; its centre is not the mean of its corners.
const L = [
  { lat: LAT, lng: LNG },
  { lat: LAT, lng: LNG + 2 * dLng },
  { lat: LAT + dLat, lng: LNG + 2 * dLng },
  { lat: LAT + dLat, lng: LNG + dLng },
  { lat: LAT + 2 * dLat, lng: LNG + dLng },
  { lat: LAT + 2 * dLat, lng: LNG },
];
const l = boundaryOf(L)!;
ok(near(l.m2, 30_000, 60), `شكل L من ثلاثة مربّعات: ${l.m2.toFixed(0)} م²`);
ok(near(l.centre.lat, LAT + (dLat * 5) / 6, 1e-7) && near(l.centre.lng, LNG + (dLng * 5) / 6, 1e-7),
   "ومركزه مركز المساحة لا متوسّط الأركان");

// A big scheme, 3 km × 4 km: 12 km² ≈ 2,857 feddans, within a tenth of a percent.
const kLat = 4000 / 111_195;
const kLng = 3000 / (111_195 * Math.cos((LAT * Math.PI) / 180));
const big = boundaryOf([
  { lat: LAT, lng: LNG },
  { lat: LAT, lng: LNG + kLng },
  { lat: LAT + kLat, lng: LNG + kLng },
  { lat: LAT + kLat, lng: LNG },
])!;
ok(Math.abs(big.m2 / 12_000_000 - 1) < 0.001, `مشروعٌ ٣×٤ كم: ${(big.m2 / 1e6).toFixed(3)} كم² (خطأ التسطيح أقلّ من ٠٫١٪)`);

console.log("\nب) ما لا يحيط بمساحة");
ok(boundaryOf(square.slice(0, 2)) === null, "ركنان لا يكفيان");
ok(boundaryOf([square[0], square[1], { lat: LAT, lng: LNG + 2 * dLng }]) === null, "ولا ثلاثة على خطٍّ واحد");
ok(boundaryOf([...square.slice(0, 3), { lat: 95, lng: LNG }]) === null, "ولا ركنٌ خارج العالم");
ok(boundaryOf([...square.slice(0, 3), { lat: NaN, lng: LNG }]) === null, "ولا ركنٌ ليس رقماً");
ok(boundaryOf(Array.from({ length: MAX_CORNERS + 1 }, (_, i) => ({
  lat: LAT + dLat * Math.sin(i), lng: LNG + dLng * Math.cos(i),
}))) === null, `ولا أكثر من ${MAX_CORNERS} ركن`);
ok(boundaryOf("x" as never) === null, "ولا ما ليس قائمة");

console.log("\nج) أقرب محطّة");
ok(nearestStation(15.55, 32.5) === "khartoum", "نقطةٌ في الخرطوم: الخرطوم");
ok(nearestStation(LAT, LNG) !== "khartoum", `وود مدني ليست الخرطوم: ${nearestStation(LAT, LNG)}`);

console.log("\nد) الفحص الذي يشترك فيه الموقع والتطبيق");
const t = (ar: string) => ar;
const good = { name: "الحوّاشة", state: "الجزيرة", feddans: 5, stationKey: "khartoum", waterSource: "canal", tenure: "owned", latitude: LAT, longitude: LNG };
ok(landInputProblem(good, t) === null, "أرضٌ صحيحة تُقبل");
ok(landInputProblem({ ...good, latitude: null, longitude: null }, t) === null, "وبلا موقع (الموقع يُضاف لاحقاً من الموقع الإلكترونيّ)");
ok(landInputProblem({ ...good, name: "" }, t) !== null, "بلا اسم تُرفض");
ok(landInputProblem({ ...good, feddans: 0 }, t) !== null, "وبلا مساحة");
ok(landInputProblem({ ...good, stationKey: "nowhere" }, t) !== null, "وبمحطّةٍ مجهولة");
ok(landInputProblem({ ...good, waterSource: "sea" }, t) !== null, "وبمصدر ماءٍ مجهول");
ok(landInputProblem({ ...good, tenure: "stolen" }, t) !== null, "وبحيازةٍ مجهولة");
ok(landInputProblem({ ...good, latitude: 48.85, longitude: 2.35 }, t) !== null, "وموقعٌ خارج السودان");
ok(landInputProblem({ ...good, name: "" }, (_ar, en) => en)?.startsWith("The land name") === true, "وبلغة القارئ");

console.log("\nهـ) التطبيق والموقع على القوائم والثوابت نفسها (mobile/lib)");
const shapeDart = readFileSync("mobile/lib/land_shape.dart", "utf8");
const screenDart = readFileSync("mobile/lib/screens/land_map_screen.dart", "utf8");
ok(new RegExp(`const m2PerFeddan = ${M2_PER_FEDDAN};`).test(shapeDart), "الفدان نفسه بالمتر المربّع");
ok(new RegExp(`const maxCorners = ${MAX_CORNERS};`).test(shapeDart), "وحدّ الأركان نفسه");
const block = (name: string) => screenDart.slice(screenDart.indexOf(`const ${name} =`), screenDart.indexOf(";", screenDart.indexOf(`const ${name} =`)));
const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
ok(JSON.stringify(quoted(block("sudanStates"))) === JSON.stringify([...SUDAN_STATES]), "والولايات نفسها بترتيبها");
const water = quoted(block("waterSources"));
ok(JSON.stringify(water.filter((_, i) => i % 2 === 0)) === JSON.stringify(Object.keys(WATER_SOURCE_LABEL)) &&
   JSON.stringify(water.filter((_, i) => i % 2 === 1)) === JSON.stringify(Object.values(WATER_SOURCE_LABEL)),
   "ومصادر الماء بأسمائها");
ok(JSON.stringify(quoted(block("tenures")).filter((_, i) => i % 2 === 0)) === JSON.stringify([...TENURES]), "وأنواع الحيازة");

console.log("");
if (failed > 0) {
  console.error(`${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("OK");
