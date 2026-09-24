/**
 * Checks the week-forecast arithmetic and the Open-Meteo parser.
 *
 * The network call itself is not exercised — CI reaches nothing outside — so
 * what is pinned here is everything that decides what a farmer reads: how a
 * week is summed, which band it falls in, and that a missing value is dropped
 * rather than read as zero rain.
 */
import {
  forecastUrl,
  parseOpenMeteo,
  summariseWeek,
  type ForecastDay,
} from "../src/lib/forecast";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const day = (date: string, rainMm: number, et0Mm: number, tmaxC = 38): ForecastDay =>
  ({ date, rainMm, et0Mm, tmaxC });

console.log("\nتلخيص الأسبوع:");
{
  const dry = summariseWeek([1, 2, 3, 4, 5, 6, 7].map((i) => day(`2026-09-2${i}`, 0.2, 7)));
  ok(dry?.band === "dry", "أسبوعٌ بلا مطر يُعتدّ به يُصنَّف جافّاً");
  ok(dry?.et0Mm === 49, "والبخر-نتح يُجمع: ٧×٧ = ٤٩");
  ok(dry?.firstRainDay === null, "ولا يومَ مطر");

  const wet = summariseWeek([day("2026-08-01", 20, 6), day("2026-08-02", 10, 6), day("2026-08-03", 0, 6)]);
  ok(wet?.band === "wet", "مطرٌ ٣٠ مقابل حاجة ١٨ يُصنَّف غزيراً");
  ok(wet?.firstRainDay === "2026-08-01", "وأوّلُ يومٍ فيه ≥٥ مم هو الأوّل");

  const some = summariseWeek([day("a", 6, 8), day("b", 0, 8), day("c", 0, 8)]);
  ok(some?.band === "some", "مطرٌ ٦ مقابل حاجة ٢٤ قليلٌ لا يغطّي");

  ok(summariseWeek([]) === null, "ولا أسبوعَ بلا أيام");
}

console.log("\nقراءة استجابة Open-Meteo:");
{
  const loc = (rain: (number | null)[]) => ({
    daily: {
      time: rain.map((_, i) => `2026-09-2${i}`),
      precipitation_sum: rain,
      et0_fao_evapotranspiration: rain.map(() => 6),
      temperature_2m_max: rain.map(() => 40),
    },
  });
  const many = parseOpenMeteo([loc([0, 1]), loc([5, null, 2])]);
  ok(many.length === 2, "عدّة مواقع ← قائمة بالترتيب نفسه");
  ok(many[1].length === 2, "واليومُ الناقص يُسقط لا يُقرأ صفراً");
  ok(parseOpenMeteo(loc([3])).length === 1, "وموقعٌ واحد ← كائنٌ لا قائمة، ويُقبل");
  ok(parseOpenMeteo({}).every((d) => d.length === 0), "واستجابةٌ بلا daily ← لا أيام");
}

console.log("\nعنوان الطلب:");
{
  const u = new URL(forecastUrl([{ latitude: 15.6, longitude: 32.53 }, { latitude: 14.4, longitude: 33.52 }]));
  ok(u.searchParams.get("latitude") === "15.6,14.4", "الإحداثيات مفصولة بفواصل");
  ok(u.searchParams.get("daily")!.includes("et0_fao_evapotranspiration"), "ويطلب ET0 بمعيار الفاو");
  ok(u.searchParams.get("timezone") === "Africa/Khartoum", "بتوقيت الخرطوم");
}

if (fail) {
  console.error(`\n${fail} failed`);
  process.exit(1);
}
console.log("\nforecast: PASS");
