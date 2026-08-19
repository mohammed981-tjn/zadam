import {
  ROUTE,
  LANDMARKS,
  SARURAB_TRANSECT,
  ROUTE_LENGTH_KM,
  SOURCE_ELEVATION_M,
  distanceKm,
  summarise,
} from "../src/lib/arcCanal";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const near = (got: number, want: number, tol: number, m: string) =>
  ok(Math.abs(got - want) <= tol, `${m} — ${got.toFixed(1)} (نتوقّع ~${want})`);

const s = summarise();

console.log("\nالمسار المقيس — سلامة البيانات\n");
ok(ROUTE.length === 41, "٤١ عيّنة ارتفاع");
ok(
  ROUTE.every((p, i) => p.index === i),
  "الفهارس متسلسلة بلا ثغرة",
);
// The alignment is west of the Nile between Jebel Aulia and Sarurab; anything
// outside this box is a transcription slip, not a route.
ok(
  ROUTE.every((p) => p.lat >= 15.2 && p.lat <= 15.8),
  "كل النقاط بين خطي عرض جبل أولياء والسروراب",
);
ok(
  ROUTE.every((p) => p.lon >= 32.2 && p.lon <= 32.52),
  "وكلها غرب النيل ضمن نطاق القوس",
);
// SRTM over this reach runs 370–460 m. A value outside it means the sample
// missed the ground or a digit was dropped.
ok(
  ROUTE.every((p) => p.elevation >= 370 && p.elevation <= 460),
  "وكل الارتفاعات ضمن نطاق التضاريس الحقيقي",
);

console.log("\nالهندسة — الطول الذي لا يتّفق مع الدراسات:");
near(ROUTE_LENGTH_KM, 94.2, 0.2, "طول نصف الدائرة π×٣٠");
ok(
  ROUTE_LENGTH_KM < 100,
  "أقصر من ١٠٠ كم — لا ٢٣٦ ولا ٢٩٥ كما تقول الدراسات",
);
near(distanceKm(0), 0, 1e-9, "المسافة عند البداية صفر");
near(distanceKm(40), ROUTE_LENGTH_KM, 1e-9, "وعند النهاية الطول الكامل");
// The western extreme is the check that settles the geometry: it lands where
// the studies themselves say the project area is.
const west = ROUTE.reduce((a, b) => (b.lon < a.lon ? b : a));
near(west.lon, 32.23, 0.01, "أقصى الغرب عند ٣٢٫٢٣°ق — أي ٢٨ كم غرب أم درمان");
ok(west.index === 20, "وهو منتصف القوس تماماً");

console.log("\nما يقوله الارتفاع، وما تقوله الدراسات:");
ok(s.peak.elevation === 441, `أعلى نقطة ${s.peak.elevation} م — لا ٤١٠–٤٣٠`);
ok(s.peak.index === 16, "وموضعها على الساق الجنوبية لا عند أقصى الغرب");
ok(s.liftM === 64, `الرفع المطلوب ${s.liftM} م — لا ٤٠–٥٥`);
ok(s.liftM > 55, "أكبر من أعلى تقدير في الدراسات");
ok(s.ridgeCount === 2, `حاجزان لا حاجز واحد (${s.ridgeCount})`);

console.log("\nالجاذبية — ولا وجود لها:");
ok(
  s.terminusAboveSourceM > 0,
  `السروراب فوق المصدر بـ${s.terminusAboveSourceM} م`,
);
ok(s.terminusElevation === 409, "منسوب السروراب ٤٠٩ م");
ok(SOURCE_ELEVATION_M === 377, "ومنسوب الخزان ٣٧٧ م");
ok(
  ROUTE.every((p) => p.elevation >= SOURCE_ELEVATION_M),
  "ولا نقطة واحدة على المسار أدنى من المصدر — فلا مقطع ينساب بالجاذبية",
);

console.log("\nمقطع السروراب — الذي يكذّب ما نشرناه نحن:");
const nile = SARURAB_TRANSECT[0];
const fiveKm = SARURAB_TRANSECT[1];
ok(nile.kmWestOfNile === 0 && nile.elevation === 381, "النيل عند ٣٨١ م");
ok(
  fiveKm.elevation - nile.elevation === 28,
  `٥ كم غرباً ترتفع ${fiveKm.elevation - nile.elevation} م — لا «بضعة أمتار»`,
);
ok(
  SARURAB_TRANSECT[SARURAB_TRANSECT.length - 1].elevation === 451,
  "و٣٠ كم غرباً تبلغ ٤٥١ م",
);
// The southern end is the claim that replaces it: ground at reservoir level.
const southern = ROUTE.slice(0, 5);
ok(
  southern.every((p) => p.elevation <= 395),
  "بينما الأرض غرب جبل أولياء مباشرةً على منسوب الخزان تقريباً",
);

console.log("\nالمعالم المسمّاة:");
ok(
  LANDMARKS.every((l) => ROUTE.some((p) => p.index === l.index)),
  "كل معلم يشير إلى عيّنة موجودة",
);
ok(
  LANDMARKS.length <= 5,
  "خمسة معالم أو أقل — التسمية انتقائية وإلا دُفن ما يهمّ",
);
ok(
  new Set(LANDMARKS.map((l) => l.index)).size === LANDMARKS.length,
  "ولا معلمان على النقطة نفسها",
);

console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
process.exit(fail === 0 ? 0 : 1);
