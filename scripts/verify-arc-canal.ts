import {
  ROUTE,
  LANDMARKS,
  SARURAB_TRANSECT,
  ROUTE_LENGTH_KM,
  SOURCE_ELEVATION_M,
  ROUTE_CLIMATE,
  END_CELL_RAINFALL,
  CORRIDOR_RAINFALL_MM,
  SCENARIO_CROP_PLAN,
  distanceKm,
  summarise,
} from "../src/lib/arcCanal";
import {
  CROPS,
  waterRequirement,
  type IrrigationMethod,
} from "../src/lib/agronomy";
import { designCanal, PILOT_REACH } from "../src/lib/canalDesign";
import {
  SOIL_POINTS,
  SOIL_SUMMARY,
  SOIL_SAMPLES_REQUESTED,
  IRRADIANCE_ANNUAL,
} from "../src/lib/canalGround";
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

console.log("\nالهندسة — طول المسار:");
near(ROUTE_LENGTH_KM, 94.2, 0.2, "طول نصف الدائرة π×٣٠");
ok(
  ROUTE_LENGTH_KM < 100,
  "أقصر من ١٠٠ كم",
);
near(distanceKm(0), 0, 1e-9, "المسافة عند البداية صفر");
near(distanceKm(40), ROUTE_LENGTH_KM, 1e-9, "وعند النهاية الطول الكامل");
// The western extreme is the check that settles the geometry: it lands where
// the studies themselves say the project area is.
const west = ROUTE.reduce((a, b) => (b.lon < a.lon ? b : a));
near(west.lon, 32.23, 0.01, "أقصى الغرب عند ٣٢٫٢٣°ق — أي ٢٨ كم غرب أم درمان");
ok(west.index === 20, "وهو منتصف القوس تماماً");

console.log("\nما يقوله الارتفاع:");
ok(s.peak.elevation === 441, `أعلى نقطة ${s.peak.elevation} م`);
ok(s.peak.index === 16, "وموضعها على الساق الجنوبية لا عند أقصى الغرب");
ok(s.liftM === 64, `الرفع الساكن ${s.liftM} م`);
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

console.log("\nخليط المحاصيل المفترض، والاحتياج المائي:");
const shareSum = SCENARIO_CROP_PLAN.reduce((s2, p) => s2 + p.share, 0);
near(shareSum, 1, 1e-9, "مجموع الحصص يساوي واحداً");
ok(
  SCENARIO_CROP_PLAN.every((p) => CROPS.some((c) => c.key === p.cropKey)),
  "وكل محصول في الخطة له معاملات FAO-56",
);
ok(
  SCENARIO_CROP_PLAN.every((p) => p.plantingMonth >= 1 && p.plantingMonth <= 12),
  "وكل شهر زراعة شهرٌ فعلي",
);

const planM3 = (method: IrrigationMethod) =>
  SCENARIO_CROP_PLAN.reduce(
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
// The single most consequential choice on the page: drip over flood removes
// about a third of the demand, and with it a third of every downstream number.
ok(
  1 - drip / flood > 0.3,
  `التنقيط بدل الغمر يخفض الطلب ${Math.round((1 - drip / flood) * 100)}٪`,
);
// And the pilot must stay small enough that it needs no sovereign allocation.
ok(
  drip * 20_000 < 0.05e9,
  "ونواة العشرين ألف فدان دون خمسين مليون م³",
);


console.log("\nالمسح الأرضي — التربة والإشعاع:");
ok(SOIL_POINTS.length >= 9, `${SOIL_POINTS.length} نقطة تربة عادت بقطاع كامل`);
// Sample zero sits on the reservoir, so one fewer than requested is correct.
ok(
  SOIL_SAMPLES_REQUESTED - SOIL_POINTS.length === 1,
  "ونقطة واحدة بلا تربة — وهي التي تقع على بحيرة الخزان",
);
ok(
  SOIL_POINTS.every((p) => p.clay + p.sand + p.silt > 95 && p.clay + p.sand + p.silt < 105),
  "ومجموع الطين والرمل والطمي مئة بالمئة في كل نقطة",
);
ok(
  SOIL_POINTS.every((p) => p.ph > 4 && p.ph < 10),
  "ودرجة الحموضة في نطاق ممكن",
);
ok(
  IRRADIANCE_ANNUAL !== null && IRRADIANCE_ANNUAL > 4 && IRRADIANCE_ANNUAL < 9,
  `الإشعاع السنوي ${IRRADIANCE_ANNUAL} ك.و.س/م²/يوم — نطاق معقول لهذا العرض`,
);

console.log("\nتصميم القناة — مانينغ والضخّ والكلفة:");
{
  const fullFlood = designCanal(500_000, "flood", SOIL_SUMMARY.clay, SOIL_SUMMARY.sand, IRRADIANCE_ANNUAL);
  const fullDrip = designCanal(500_000, "drip", SOIL_SUMMARY.clay, SOIL_SUMMARY.sand, IRRADIANCE_ANNUAL);
  const small = designCanal(20_000, "drip", SOIL_SUMMARY.clay, SOIL_SUMMARY.sand, IRRADIANCE_ANNUAL, PILOT_REACH);

  // Manning solved by inversion rather than iteration: check it against the
  // forward equation, which is the only thing that proves the algebra.
  const y = fullFlood.depthM;
  const b = 2 * y;
  const a = y * (b + 1.5 * y);
  const pWet = b + 2 * y * Math.sqrt(1 + 1.5 * 1.5);
  const qForward = (1 / 0.025) * a * Math.pow(a / pWet, 2 / 3) * Math.sqrt(0.0001);
  near(qForward, fullFlood.designQ, 0.5, "العمق المحسوب يعيد التصرّف نفسه في معادلة مانينغ");

  ok(fullFlood.velocityOk, `السرعة ${fullFlood.velocityMS.toFixed(2)} م/ث داخل نطاق القناة الترابية`);
  ok(small.velocityOk, `وسرعة النواة ${small.velocityMS.toFixed(2)} م/ث كذلك`);

  ok(fullDrip.designQ < fullFlood.designQ, "التنقيط يصغّر التصرّف");
  ok(fullDrip.peakPowerMW < fullFlood.peakPowerMW, "ويصغّر القدرة");
  ok(fullDrip.capexHighM < fullFlood.capexHighM, "ويصغّر الكلفة");

  // Every downstream number must fall with the reach, not only with the area.
  ok(small.stations === 1, "النواة بمحطة رفع واحدة");
  ok(
    small.fixedCostPerFeddanHigh < fullFlood.fixedCostPerFeddanLow / 3,
    "وكلفة مائها للفدان دون ثلث كلفة الحجم الكامل",
  );
  ok(
    (small.pvMwp ?? 99) < 2,
    `ومصفوفتها الشمسية ${small.pvMwp?.toFixed(1)} ميغاواط ذروة — لا قرار في الشبكة`,
  );

  // Seepage must be a real share and not a rounding artefact, and must not run
  // away: a canal losing more than half of what enters it is a design error,
  // not a finding.
  for (const d of [fullFlood, fullDrip, small]) {
    ok(
      d.seepageShare > 0.01 && d.seepageShare < 0.5,
      `التسرّب ${Math.round(d.seepageShare * 100)}٪ عند ${d.areaFeddan.toLocaleString("en-US")} فدان`,
    );
  }

  ok(
    fullFlood.totalHeadM > fullFlood.staticLiftM,
    "والرفع الكلّي فوق الساكن — الاحتكاك محسوب لا مهمل",
  );
}

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
