/**
 * مالُ الدفتر (البند ١٨٦): الأعداد الصحيحة، والتحويل المطابق للقاعدة، والتوزيع بلا ضياع وحدة.
 *
 *   npx tsx scripts/verify-ledger-money.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURRENCIES,
  MAX_MINOR,
  allocate,
  formatMoney,
  formatRate,
  minorToDecimal,
  normaliseNumber,
  parseAmount,
  parseRate,
  splitEvenly,
  sumMinor,
  toBase,
  toWire,
} from "../src/lib/ledger/money";
import { STAGE_TEMPLATES } from "../src/lib/season";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
  const ok = show(got) === show(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${show(got)}, want ${show(want)}`}`);
  if (!ok) failed++;
};
const throws = (fn: () => unknown, label: string) => {
  try {
    fn();
    console.log(`  FAIL  ${label} — did not throw`);
    failed++;
  } catch {
    console.log(`  PASS  ${label}`);
  }
};
const n = (x: number | string) => BigInt(x);

console.log("\nأ) التحويل: يطابق المرجع حالةً حالة (والقاعدة تطابقه)");
const fixtures = JSON.parse(readFileSync(join(__dirname, "fixtures/ledger-money.json"), "utf8")) as {
  toBase: { minor: number; rate: string; expected: number }[];
};
let bad = 0;
for (const c of fixtures.toBase) {
  const rate = parseRate(c.rate);
  // The fixtures include rates below 1; parseRate refuses those as typing mistakes, so convert directly.
  const micro = rate ?? BigInt(Math.round(Number(c.rate) * 1_000_000));
  if (toBase(n(c.minor), micro) !== n(c.expected)) {
    bad++;
    console.log(`    ${c.minor} @ ${c.rate}: got ${toBase(n(c.minor), micro)}, want ${c.expected}`);
  }
}
eq(bad, 0, `${fixtures.toBase.length} حالةً من المرجع`);
eq(fixtures.toBase.length >= 200, true, "والمرجع واسع");
eq(toBase(n(30000000), n(1000_000000)), n(30000), "٣٠٠٬٠٠٠ جنيه بسعر ١٠٠٠ = ٣٠٠ دولار");
eq(toBase(n(1), n(2_000000)), n(1), "نصف سنتٍ يُقرَّب للأعلى");
eq(toBase(n(3), n(2_000000)), n(2), "وسنتٌ ونصف إلى اثنين");
eq(toBase(n(100), n(2_000000), 2, 0), n(1), "وبخانتين إلى صفر خانة");
eq(toBase(n(0), n(1000_000000)), n(0), "والصفر صفر");
throws(() => toBase(n(-1), n(1000_000000)), "مبلغٌ سالب يُرفض");
throws(() => toBase(n(1), n(0)), "وسعرٌ صفر يُرفض");

console.log("\nب) قراءة المبلغ كما يكتبه الناس");
const usd = (s: string) => parseAmount(s, "USD");
eq(usd("300"), n(30000), "٣٠٠ دولار");
eq(usd("300.5"), n(30050), "٣٠٠٫٥");
eq(usd("0.05"), n(5), "خمسة سنتات");
eq(usd("1,234.50"), n(123450), "فاصلة الآلاف");
eq(usd("١٢٣٤٫٥٠"), n(123450), "الأرقام العربيّة والفاصلة العشريّة العربيّة");
eq(usd("١٬٢٣٤٫٥٠"), n(123450), "وفاصلة الآلاف العربيّة");
eq(usd("12 345.6"), n(1234560), "ومسافة الآلاف");
eq(usd("0"), n(0), "الصفر يُقرأ (ويرفضه من يحتاج موجباً)");
eq(usd("100000000000.00"), MAX_MINOR, "أكبر مبلغ مسموح");
eq(usd("100000000000.01"), null, "وما فوقه يُرفض");
for (const s of ["", " ", "abc", "-5", "+5", "1.234", "12,5", "1,23", "1,2345", ".5", "5.", "1e3", "1..2", "١٢,٣", "1,234,5"]) {
  eq(usd(s), null, `«${s}» لا يُقرأ مبلغاً`);
}
eq(parseAmount("300.500", "SDG"), null, "ولا ثلاث خانات عشريّة بالجنيه (لا تقريبَ صامت)");
eq(parseAmount("300000", "SDG"), n(30000000), "٣٠٠٬٠٠٠ جنيه");
eq(normaliseNumber("٣٫٥"), "3.5", "تطبيع الأرقام");

console.log("\nج) من الوحدة الصغرى إلى نصّ");
eq(minorToDecimal(n(30050), "USD"), "300.50", "٣٠٠٫٥٠");
eq(minorToDecimal(n(5), "USD"), "0.05", "٠٫٠٥");
eq(minorToDecimal(n(0), "USD"), "0.00", "صفر");
eq(minorToDecimal(n(-150), "USD"), "-1.50", "وسالب");
eq(formatMoney(n(123450), "USD"), "1,234.50 دولار", "عرضٌ بفاصلة الآلاف واسم العملة");
eq(formatMoney(n(100000000), "SDG"), "1,000,000.00 جنيه", "ومليون جنيه");
eq(formatMoney(n(-123450), "USD", false), "-1,234.50", "وسالباً بلا اسم");
eq(formatMoney(n(99), "USD", false), "0.99", "وأقلّ من واحد");
let roundtrip = 0;
// mulberry32: a small seeded generator, so a failure repeats.
let seed = 20261024;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
for (let i = 0; i < 2000; i++) {
  const m = n(Math.floor(rnd() * 10 ** (1 + Math.floor(rnd() * 12))));
  if (parseAmount(minorToDecimal(m, "USD"), "USD") !== m) roundtrip++;
  if (parseAmount(formatMoney(m, "SDG", false), "SDG") !== m) roundtrip++;
}
eq(roundtrip, 0, "كتابة المبلغ ثمّ قراءته ترجعه بالتمام (٤٬٠٠٠ مرّة)");

console.log("\nد) سعر الصرف");
eq(parseRate("1000"), n(1000_000000), "١٠٠٠");
eq(parseRate("2450.5"), n(2450_500000), "٢٤٥٠٫٥");
eq(parseRate("1000.123456"), n(1000_123456), "ست خانات");
eq(parseRate("١٬٢٥٠٫٧٥"), n(1250_750000), "وبالأرقام العربيّة");
for (const s of ["1000.1234567", "0.5", "0", "100000001", "-1", "abc", "", "12,5"]) {
  eq(parseRate(s), null, `«${s}» ليس سعراً مقبولاً`);
}
eq(parseRate("100000000"), n(100000000_000000), "وأعلى سعرٍ مقبول");
eq(parseRate("1"), n(1_000000), "وأدناه");
eq(formatRate(n(1000_000000)), "1000", "سعرٌ بلا كسور");
eq(formatRate(n(2450_500000)), "2450.5", "وبكسرٍ واحد");
eq(formatRate(n(1000_123456)), "1000.123456", "وبستّ خانات");
eq(formatRate(n(1_000000)), "1", "وواحد");

console.log("\nهـ) التوزيع: لا تضيع وحدةٌ ولا تُخترع");
eq(allocate(n(10), [1, 1, 1]), [n(4), n(3), n(3)], "عشرة على ثلاثة: ٤ و٣ و٣ (الباقي للأوّل)");
eq(allocate(n(100), [1, 2, 3]).map(Number), [17, 33, 50], "١٠٠ بنسبة ١:٢:٣ — ١٦٫٧ و٣٣٫٣ و٥٠");
eq(allocate(n(0), [1, 2]), [n(0), n(0)], "صفر يوزَّع أصفاراً");
eq(allocate(n(-10), [1, 1, 1]), [n(-4), n(-3), n(-3)], "والسالب يتماثل");
eq(allocate(n(5), [0, 1, 0]), [n(0), n(5), n(0)], "وصاحب الوزن الصفر لا يأخذ");
eq(splitEvenly(n(7), 2), [n(4), n(3)], "قسمة السبعة على اثنين");
eq(allocate(n(1), [1, 1, 1]), [n(1), n(0), n(0)], "وسنتٌ واحدٌ لأوّل الأسهم");
eq(allocate(n(10), [0.1, 0.2, 0.7]).map(Number), [1, 2, 7], "وأوزانٌ كسريّة");
throws(() => allocate(n(10), []), "بلا أسهم يُرفض");
throws(() => allocate(n(10), [0, 0]), "وأوزانٌ كلّها صفر");
throws(() => allocate(n(10), [1, -1]), "ووزنٌ سالب");
throws(() => allocate(n(10), [1, Number.NaN]), "ووزنٌ ليس عدداً");

const shares = Object.values(STAGE_TEMPLATES).map((t) => t.budgetShare);
eq(Math.round(shares.reduce((a, b) => a + b, 0) * 1e6), 1_000_000, "نسب المراحل السبع تجمع إلى ١");
let sumsRight = 0;
let naiveWrong = 0;
let samples = 0;
for (let budget = 100; budget <= 200_000; budget += 137) {
  samples++;
  const parts = allocate(n(budget), shares);
  if (sumMinor(parts) === n(budget)) sumsRight++;
  const naive = shares.map((s) => Math.round(budget * s)).reduce((a, b) => a + b, 0);
  if (naive !== budget) naiveWrong++;
}
eq(sumsRight, samples, `توزيع ميزانيّة الموسم على المراحل يجمع إلى الأصل دائماً (${samples} ميزانيّة)`);
eq(naiveWrong > 0, true, `بينما التقريب مرحلةً مرحلة أخطأ في ${naiveWrong} منها`);

let always = 0;
for (let i = 0; i < 3000; i++) {
  const total = n(Math.floor(rnd() * 10 ** (1 + Math.floor(rnd() * 12))) * (rnd() < 0.2 ? -1 : 1));
  const w = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Math.floor(rnd() * 100));
  if (w.reduce((a, b) => a + b, 0) === 0) w[0] = 1;
  const parts = allocate(total, w);
  const exact = sumMinor(parts) === total && parts.every((p) => (total >= BigInt(0) ? p >= BigInt(0) : p <= BigInt(0)));
  if (exact) always++;
}
eq(always, 3000, "وعلى ٣٬٠٠٠ حالةٍ عشوائيّة: المجموع هو الأصل والإشارة محفوظة");

console.log("\nو) العبور إلى JSON");
eq(toWire(n(30000)), 30000, "عددٌ آمن يمرّ");
eq(toWire(MAX_MINOR), 10_000_000_000_000, "وأكبر مبلغٍ مسموح يمرّ");
throws(() => toWire(BigInt("9007199254740993")), "وما فوق الحدّ الآمن يُرفض بدل أن يُقرَّب");
eq(CURRENCIES.USD.digits, 2, "للدولار خانتان");

console.log("");
if (failed > 0) {
  console.error(`${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("OK");
