/**
 * Checks the rain-map grid: that it covers Sudan and nothing far outside it,
 * that bands are chosen right, and that a cell with no forecast is dropped
 * rather than painted dry.
 */
import {
  FORECAST_TOWNS,
  LAYERS,
  RAIN_CELLS,
  SOIL_CLASSES,
  availableLayers,
  bandIn,
  cellKeyAt,
  countLands,
  layerFor,
  toDailyTable,
  SUDAN_BORDER,
  bandFor,
  insideSudan,
  sumGrid,
} from "../src/lib/rainMap";
import { samplePoints } from "./fetch-sudan-soil";
import { WRB } from "../src/lib/soilClasses";
import { ROUTE } from "../src/lib/arcCanal";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nالحدود والشبكة:");
ok(SUDAN_BORDER.length > 50, "حدود السودان مرسومة بأكثر من ٥٠ نقطة");
ok(insideSudan([32.53, 15.6]), "الخرطوم داخل الحدود");
ok(insideSudan([35.39, 14.03]), "القضارف داخل الحدود");
ok(insideSudan([24.88, 12.05]), "نيالا داخل الحدود");
ok(insideSudan([36.64, 22.22]), "حلايب داخل الحدود");
ok(insideSudan([36.4, 22.37]), "وأبو رماد داخلها");
ok(RAIN_CELLS.some((c) => c.labelled && c.lat > 22 && c.lon > 35), "ولمثلث حلايب مربّعٌ برقمه");
ok(RAIN_CELLS.every((c) => insideSudan([c.pLon, c.pLat])), "وكلّ نقطة توقّعٍ داخل الحدود لا في البحر ولا عند الجيران");
ok(!insideSudan([32.9, 24.09]), "أسوان خارجها");
ok(!insideSudan([31.23, 30.04]), "القاهرة خارجها");
ok(!insideSudan([38.74, 9.03]), "أديس أبابا خارجها");
ok(!insideSudan([31.58, 4.85]), "جوبا خارجها — الحدود بعد ٢٠١١");
ok(RAIN_CELLS.length >= 60 && RAIN_CELLS.length <= 100, `عدد المربّعات معقول (${RAIN_CELLS.length})`);
ok(RAIN_CELLS.every((c) => c.lat > 8 && c.lat < 24 && c.lon > 21 && c.lon < 39), "كلّها في صندوق السودان");
ok(
  RAIN_CELLS.some((c) => c.labelled && Math.abs(c.lon - 32.5) <= 0.75 && Math.abs(c.lat - 15.25) <= 0.75),
  "مربّع الخرطوم موجود ويحمل رقماً",
);

console.log("\nالألوان:");
ok(bandFor(0).min === 0, "صفر ← بلا مطر");
ok(bandFor(0.9).min === 0, "٠٫٩ ← بلا مطر");
ok(bandFor(1).min === 1, "١ ← أوّل درجة");
ok(bandFor(29.9).min === 15, "٢٩٫٩ ← ١٥–٣٠");
ok(bandFor(200).min === 60, "٢٠٠ ← أعلى درجة");

console.log("\nالجمع:");
{
  const cells = [
    { lon: 32.5, lat: 15.25, pLon: 32.5, pLat: 15.25, labelled: true },
    { lon: 34, lat: 13.75, pLon: 34, pLat: 13.75, labelled: true },
  ];
  const loc = (rain: (number | null)[]) => ({
    daily: {
      time: rain.map((_, i) => `2026-09-${25 + i}`),
      precipitation_sum: rain,
      et0_fao_evapotranspiration: rain.map(() => 6),
      temperature_2m_max: rain.map(() => 38),
    },
  });
  const g = sumGrid(cells, [loc([1, 2, 3.25]), { daily: {} }]);
  ok(g?.cells.length === 1, "مربّعٌ بلا بيانات يُسقط ولا يُلوَّن جافّاً");
  ok(g?.cells[0].rainMm === 6.3, "والمطر يُجمع ويُقرَّب لعُشر");
  ok(g?.from === "2026-09-25" && g?.to === "2026-09-27", "ومدى الأيام صحيح");
  ok(sumGrid(cells, [{ daily: {} }]) === null, "ولا خريطة حين لا بيانات أصلاً");
  ok(g?.cells[0].et0Mm === 18 && g?.cells[0].tmaxC === 38, "وحاجة الجوّ تُجمع والحرارة أعلاها");
  ok(g?.cells[0].elevM === null, "وبلا ارتفاعٍ حين لم يُقرأ");
  const withElev = sumGrid(cells, [loc([0]), loc([0])], [380, null]);
  ok(withElev?.cells[0].elevM === 380 && withElev?.cells[1].elevM === null, "والارتفاع يُطابَق بالترتيب");
}

console.log("\nالطبقات:");
ok(LAYERS.map((l) => l.key).join() === "rain,tmax,et0,elev,soil,lands", "ستّ طبقات بالترتيب");
ok(layerFor("elev").key === "elev" && layerFor("junk").key === "rain", "والمجهولة تعود إلى المطر");
ok(LAYERS.every((l) => l.bands.every((b, i) => i === 0 || b.min > l.bands[i - 1].min)), "درجات كلّ طبقة تصاعدية");
ok(LAYERS.slice(0, 4).every((l) => l.bands.length === 6), "ستّ درجات لكلّ طبقةٍ متّصلة");
ok(layerFor("soil").numbers === false, "والتربة صنفٌ يُلوَّن ولا يُكتب رقمه");
ok(bandIn(layerFor("tmax").bands, 45).label.startsWith("٤٤"), "٤٥° ← أعلى درجات الحرارة");
ok(bandIn(layerFor("elev").bands, 120).min === -99, "١٢٠ م ← أدنى درجات الارتفاع");

console.log("\nالتربة والأراضي ومسار القناة:");
{
  ok(cellKeyAt(32.53, 15.6) === "33.00,15.25", "الخرطوم في مربّعها الصحيح");
  ok(cellKeyAt(21.75, 8.5) === "22.50,9.25" && cellKeyAt(38.75, 10) === null, "وحافّة الشبكة: الركن داخلها وما بعدها خارجها");
  ok(cellKeyAt(31.23, 30.04) === null, "والقاهرة خارج الشبكة");
  const n = countLands([
    { latitude: 15.6, longitude: 32.53 },
    { latitude: "15.4", longitude: "32.9" },
    { latitude: 14.03, longitude: 35.39 },
    { latitude: null, longitude: 32 },
    { latitude: 30.04, longitude: 31.23 },
  ]);
  ok(n.get("33.00,15.25") === 2, "أرضان في مربّع الخرطوم (والأرقام نصّاً تُقرأ)");
  ok(n.size === 2, "وأرضٌ بلا إحداثيات أو خارج الشبكة لا تُعدّ");

  const cells = [
    { lon: 33, lat: 15.25, pLon: 33, pLat: 15.25, labelled: true },
    { lon: 34.5, lat: 13.75, pLon: 34.5, pLat: 13.75, labelled: true },
  ];
  const day = { daily: { time: ["2026-09-25"], precipitation_sum: [0], et0_fao_evapotranspiration: [6], temperature_2m_max: [38] } };
  const g = sumGrid(cells, [day, day], null, n)!;
  ok(g.cells[0].lands === 2 && g.cells[1].lands === null, "والعدد يُطابَق بموضع المربّع، وبلا أرضٍ يبقى فارغاً");
  const names = availableLayers(g).map((l) => l.key);
  ok(names.includes("lands"), "وطبقة الأراضي تظهر دائماً");
  ok(!names.includes("elev"), "وطبقةٌ بلا قيمة (الارتفاع) تختفي");
  ok(availableLayers(sumGrid(cells, [day, day])!).some((l) => l.key === "lands"), "حتى حين لا أرض أصلاً");
  ok(SOIL_CLASSES.every((w) => w in WRB), "وكلّ صنف تربةٍ في البيانات له اسمٌ عربيّ ولون");
  ok(
    names.includes("soil") === SOIL_CLASSES.length > 0,
    SOIL_CLASSES.length ? "وطبقة التربة تظهر لأنّ مسحها موجود" : "وطبقة التربة مخفيّة حتى يُجرى مسحها",
  );

  ok(ROUTE.every((p) => insideSudan([p.lon, p.lat])), "ومسار القناة القوسية داخل الحدود");
  ok(ROUTE.every((p) => cellKeyAt(p.lon, p.lat) != null), "وعلى شبكة الخريطة");

  const pts = RAIN_CELLS.map(samplePoints);
  ok(pts.every((p) => p.length >= 1 && p.length <= 5), "من نقطةٍ إلى خمسٍ لكلّ مربّع");
  ok(pts.flat().every((q) => insideSudan(q)), "وكلّ نقاط التربة داخل الحدود");
  const total = pts.reduce((a, p) => a + p.length, 0);
  ok(total * 13 < 200 * 60, `ومسحها كلّه (${total} نقطة) يسعه وقت الـ Action`);
}

console.log("\nالجدول اليومي:");
{
  const loc = (n: number) => ({
    daily: {
      time: Array.from({ length: n }, (_, i) => `2026-09-${25 + i}`),
      precipitation_sum: Array.from({ length: n }, () => 2),
      et0_fao_evapotranspiration: Array.from({ length: n }, () => 6),
      temperature_2m_max: Array.from({ length: n }, () => 38),
    },
  });
  const json = FORECAST_TOWNS.map((_, i) => (i === 1 ? { daily: {} } : loc(7)));
  const t = toDailyTable(json);
  ok(t?.towns.length === FORECAST_TOWNS.length - 1, "مدينةٌ بلا بيانات تُسقط");
  ok(t?.dates.length === 7, "وسبعة أيام");
  ok(t?.towns[0].name === FORECAST_TOWNS[0].name, "والترتيب محفوظ");
  ok(toDailyTable([]) === null, "ولا جدول بلا بيانات");
  ok(FORECAST_TOWNS.every((x) => insideSudan([x.lon, x.lat])), "كلّ المدن داخل الحدود");
}

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
