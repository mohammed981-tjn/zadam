/**
 * Checks the rain-map grid: that it covers Sudan and nothing far outside it,
 * that bands are chosen right, and that a cell with no forecast is dropped
 * rather than painted dry.
 */
import {
  RAIN_CELLS,
  SUDAN_BORDER,
  bandFor,
  insideSudan,
  sumGrid,
} from "../src/lib/rainMap";

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
ok(!insideSudan([31.23, 30.04]), "القاهرة خارجها");
ok(!insideSudan([38.74, 9.03]), "أديس أبابا خارجها");
ok(!insideSudan([31.58, 4.85]), "جوبا خارجها — الحدود بعد ٢٠١١");
ok(RAIN_CELLS.length >= 60 && RAIN_CELLS.length <= 120, `عدد المربّعات معقول (${RAIN_CELLS.length})`);
ok(RAIN_CELLS.every((c) => c.lat > 8 && c.lat < 23 && c.lon > 21 && c.lon < 39), "كلّها في صندوق السودان");
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
    { lon: 32.5, lat: 15.25, labelled: true },
    { lon: 34, lat: 13.75, labelled: true },
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
}

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
