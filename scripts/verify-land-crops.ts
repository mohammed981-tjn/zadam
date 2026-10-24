/**
 * «المحاصيل التي تناسب أرضك» (البند ١٥٢): every rule reads what the land
 * records, and every number is the one its source prints.
 */
import { CROPS } from "../src/lib/agronomy";
import { SALT, SOWING, cropsForLand } from "../src/lib/landCrops";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nالفاو ٢٩ كما في جدولَيه:");
const fao: [string, string, number | undefined][] = [
  ["cotton", "T", 7.7], ["dates", "T", 4.0], ["sorghum", "MT", 6.8], ["wheat", "MT", 6.0],
  ["groundnut", "MS", 3.2], ["maize", "MS", 1.7], ["sugarcane", "MS", 1.7], ["alfalfa", "MS", 2.0],
  ["tomato", "MS", 2.5], ["sesame", "S", undefined], ["onion", "S", 1.2],
];
for (const [k, cls, ece] of fao) ok(SALT[k]?.cls === cls && SALT[k]?.ece === ece, `${k}: ${cls}${ece != null ? ` و${ece}` : ""}`);
ok(!("millet" in SALT), "والدخن ليس في الجدول (فيه الدخن الثعلبيّ لا اللؤلؤيّ)");

console.log("\nموعد الزراعة:");
ok(Object.keys(SOWING).every((k) => CROPS.some((c) => c.key === k)), "كلّ محصولٍ له موعد موجودٌ في جدول المحاصيل");
ok(SOWING.wheat.month === 10 && SOWING.cotton.month === 6 && SOWING.onion.month === 9, "القمح نوفمبر، والقطن يوليو، والبصل أكتوبر");

console.log("\nالماء:");
const base = { station_key: "gezira", water_source: "canal", previous_crops: null, soil_class: "Vertisols" };
const plenty = cropsForLand({ ...base, water_per_feddan: 50_000 });
ok(plenty.fits.every((f) => f.water === "flood"), "ماءٌ وفير: كلّها بالغمر");
const little = cropsForLand({ ...base, water_per_feddan: 2_500 });
ok(little.fits.some((f) => f.water !== "flood"), "ماءٌ قليل: بعضها لا يكفيه الغمر");
ok(little.fits.every((f, i, a) => i === 0 || ({ flood: 0, drip: 1, unknown: 2, short: 3 })[a[i - 1].water] <= ({ flood: 0, drip: 1, unknown: 2, short: 3 })[f.water]), "وما يكفيه الماء أوّلاً");
const unknown = cropsForLand({ ...base, water_per_feddan: null });
ok(unknown.fits.every((f) => f.water === "unknown" && f.floodM3! > f.dripM3!), "بلا ماءٍ مسجَّل: الحاجة وحدها، والتنقيط أقلّ من الغمر");
ok(unknown.noMonth.some((c) => c.key === "sesame") && !unknown.fits.some((f) => f.crop.key === "sesame"), "والسمسم بلا موعدٍ بمصدر: لا يُحسب في شهرٍ مُخمَّن");

console.log("\nالمطر والملوحة:");
const rain = cropsForLand({ ...base, station_key: "kordofan", water_source: "rainfed", water_per_feddan: null });
ok(rain.fits.every((f) => f.floodM3 === null && f.rainShortM3 != null), "المطريّة: ما يبقى بعد المطر لا الريّ");
const salty = cropsForLand({ ...base, soil_class: "Solonchaks", water_per_feddan: 50_000 });
ok(salty.saline && salty.fits[0].salt?.cls === "T", `التربة الملحيّة: يتقدّم المتحمّل (${salty.fits[0].crop.key})`);
ok(salty.fits.at(-1)!.salt?.cls !== "T", "ويتأخّر الحسّاس");
const wanted = cropsForLand({ ...base, water_per_feddan: 50_000, crop_keys: ["onion"], previous_crops: "قمح ثمّ بصل" });
ok(wanted.fits.find((f) => f.crop.key === "onion")!.wanted, "ما يريده صاحب الأرض مُعلَّم");
ok(wanted.fits.find((f) => f.crop.key === "wheat")!.grownBefore, "وما زرعه من قبل مُعلَّم");

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
