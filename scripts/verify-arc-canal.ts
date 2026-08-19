import {
  ROUTE,
  LANDMARKS,
  SARURAB_TRANSECT,
  ROUTE_LENGTH_KM,
  SOURCE_ELEVATION_M,
  ROUTE_CLIMATE,
  END_CELL_RAINFALL,
  CORRIDOR_RAINFALL_MM,
  STUDY_CROP_PLAN,
  distanceKm,
  summarise,
} from "../src/lib/arcCanal";
import {
  CROPS,
  waterRequirement,
  type IrrigationMethod,
} from "../src/lib/agronomy";
import { GEOMETRY_SQL } from "./emit-arc-canal-geometry";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("\nمناخ الممرّ — وحدود الشبكة:");
// The climate point must be on the thing it claims to describe.
ok(
  ROUTE_CLIMATE.latitude >= 15.2 &&
    ROUTE_CLIMATE.latitude <= 15.8 &&
    ROUTE_CLIMATE.longitude >= 32.2 &&
    ROUTE_CLIMATE.longitude <= 32.52,
  "نقطة المناخ داخل صندوق المسار نفسه",
);
ok(ROUTE_CLIMATE.source === "nasa-power", "ومصدرها مقيس لا تقديري");
ok(
  ROUTE_CLIMATE.tmax.length === 12 &&
    ROUTE_CLIMATE.tmin.length === 12 &&
    ROUTE_CLIMATE.rainfall.length === 12,
  "اثنا عشر شهراً في كل سلسلة",
);
ok(
  ROUTE_CLIMATE.tmax.every((t, i) => t > ROUTE_CLIMATE.tmin[i]),
  "والعظمى فوق الصغرى في كل شهر",
);
// One number for the corridor's rainfall, and it is the one the water model
// integrates — a card quoting POWER's annual total beside a table built from
// the monthly series would differ by the rounding and read as a mistake.
ok(
  CORRIDOR_RAINFALL_MM ===
    ROUTE_CLIMATE.rainfall.reduce((a, b) => a + b, 0),
  `أمطار الممرّ ${CORRIDOR_RAINFALL_MM} ملم — مجموع السلسلة الشهرية نفسها`,
);
// The whole reason there is one profile and not five: the ends are different
// cells, and the middle is one. If that stops being true the page's caveat is
// wrong and must be rewritten.
ok(
  END_CELL_RAINFALL.south > CORRIDOR_RAINFALL_MM &&
    CORRIDOR_RAINFALL_MM > END_CELL_RAINFALL.north,
  "والطرفان يحيطان بالممرّ: الجنوب أمطر والشمال أجفّ",
);

console.log("\nخطّة محاصيل الدراسة، والاحتياج المائي:");
const shareSum = STUDY_CROP_PLAN.reduce((s2, p) => s2 + p.share, 0);
near(shareSum, 1, 1e-9, "مجموع الحصص يساوي واحداً");
ok(
  STUDY_CROP_PLAN.every((p) => CROPS.some((c) => c.key === p.cropKey)),
  "وكل محصول في الخطة له معاملات FAO-56",
);
ok(
  STUDY_CROP_PLAN.every((p) => p.plantingMonth >= 1 && p.plantingMonth <= 12),
  "وكل شهر زراعة شهرٌ فعلي",
);

const planM3 = (method: IrrigationMethod) =>
  STUDY_CROP_PLAN.reduce(
    (s2, p) =>
      s2 +
      waterRequirement(
        CROPS.find((c) => c.key === p.cropKey)!,
        ROUTE_CLIMATE,
        p.plantingMonth,
        method,
      ).m3PerFeddan *
        p.share,
    0,
  );

const flood = planM3("flood");
const drip = planM3("drip");
near(flood * 500_000 / 1e9, 1.72, 0.05, "الغمر لـ٥٠٠ ألف فدان، مليار م³");
near(drip * 500_000 / 1e9, 1.05, 0.05, "والتنقيط، مليار م³");
ok(drip < flood, "والتنقيط أقلّ من الغمر — وإلا انهار منطق القسم كلّه");
// The comparison the section is written to make: designing for the efficiency
// the studies set as their own KPI removes about a third of the demand.
ok(
  1 - drip / flood > 0.3,
  `التصميم بالكفاءة الموعودة يخفض الطلب ${Math.round((1 - drip / flood) * 100)}٪`,
);
// And the pilot must stay small enough that it needs no sovereign allocation.
ok(
  drip * 20_000 < 0.05e9,
  "ونواة العشرين ألف فدان دون خمسين مليون م³",
);

console.log("\nالجدول والوحدة البرمجية — لا انحراف بينهما:");
// The elevations now exist twice: in the module the charts render from, and in
// the migration the database is loaded from. This is the only thing keeping
// them the same number.
{
  const file = readFileSync(
    join(import.meta.dirname, "..", "supabase", "migrations",
      "20260819100100_arc_canal_geometry_rows.sql"),
    "utf8",
  );
  ok(
    file === GEOMETRY_SQL,
    "ملف الترحيل مطابق لما يولّده emit-arc-canal-geometry من القياسات",
  );
}

console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
process.exit(fail === 0 ? 0 : 1);
