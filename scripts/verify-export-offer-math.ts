/**
 * حسابُ قيمة العرض — بأعدادٍ صحيحةٍ لا عائمة.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * `export_offers` carries a constraint the browser never sees:
 *
 *     value_minor = round(quantity * unit_price_minor)
 *
 * PostgreSQL evaluates it in exact decimal. A screen that computes the same
 * total in JavaScript floating point will sometimes produce a different
 * integer, and when it does the insert is refused by constraint name — the
 * offer will not save and nothing tells the farmer why.
 *
 * Section B does not take that on trust. It searches ordinary commercial
 * numbers for cases where the naive float computation and the exact one
 * actually disagree, and fails if it cannot find any: a hazard this code is
 * written to avoid must be demonstrable, or the code is guarding nothing.
 */

import {
  parseDecimal,
  offerAmounts,
  quantityToString,
  formatMinor,
  originProblem,
  offerReference,
  OFFER_STATUS_LABEL,
  OFFER_STATUS_HELP,
  QUANTITY_SCALE,
} from "../src/lib/exportOffers";

let fail = 0;
function ok(cond: boolean, label: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
}
function eq<T>(got: T, want: T, label: string) {
  ok(got === want, `${label} — got ${String(got)}`);
}

console.log("\n==========================================================================");
console.log("A) قراءةُ العدد العشري — وما تردّه");
console.log("==========================================================================");

eq(parseDecimal("7.5", 4), BigInt(75000), "٧٫٥ بمقياس ٤");
eq(parseDecimal("7", 4), BigInt(70000), "عددٌ صحيحٌ يُوسَّع");
eq(parseDecimal("0.0001", 4), BigInt(1), "أصغرُ كسرٍ يُقبل");
eq(parseDecimal("128690", 4), BigInt(1286900000), "ورقمٌ كبيرٌ يمرّ بلا فقدِ دقّة");

// كلُّ ما يلي رفضٌ مقصود: تخمينُ ما قصده الكاتب يضع في عقدٍ رقماً لم يكتبه.
eq(parseDecimal("7.50001", 4), null, "كسرٌ أطول من عمود القاعدة");
eq(parseDecimal("-3", 4), null, "سالب");
eq(parseDecimal("1e3", 4), null, "أسّي");
eq(parseDecimal("1,000", 4), null, "بفاصلة آلاف");
eq(parseDecimal("", 4), null, "فارغ");
eq(parseDecimal("٧٫٥", 4), null, "بأرقامٍ عربيةٍ هندية — لا تُخمَّن");

console.log("\n==========================================================================");
console.log("B) الخطرُ الذي وُجد هذا الحساب لأجله — والعائمُ يخطئ فعلاً");
console.log("==========================================================================");

{
  // The exact answer, computed independently of the module under test: read the
  // digits, multiply as integers, round half away from zero.
  function exactValue(q: string, priceMinor: bigint): bigint {
    const [w, f = ""] = q.split(".");
    const scaled = BigInt(w + f.padEnd(QUANTITY_SCALE, "0"));
    const unit = BigInt(10) ** BigInt(QUANTITY_SCALE);
    return (scaled * priceMinor + unit / BigInt(2)) / unit;
  }

  let disagreements = 0;
  let mismatchesAgainstExact = 0;
  let example = "";

  // بالمئات لا بالأثمان. وهذا الفرقُ هو الدرسُ نفسُه: الثُّمنُ يُمثَّل في
  // الثنائي تماماً، فمسحٌ بالأثمان لا يجد خطأً ويوهم أنّ الخطر نظري. والكسورُ
  // العشرية — وهي ما يكتبه الناس فعلاً — لا تُمثَّل، فيظهر الخطأ.
  for (let qi = 1; qi <= 400; qi++) {
    for (let p = 1; p <= 400; p++) {
      const q = (qi / 100).toFixed(4);
      const priceMinor = BigInt(p * 7);

      const mine = offerAmounts(q, (Number(priceMinor) / 100).toFixed(2), 100)!;
      const exact = exactValue(q, priceMinor);

      if (mine.valueMinor !== exact) mismatchesAgainstExact++;

      const naive = BigInt(Math.round(parseFloat(q) * Number(priceMinor)));
      if (naive !== exact) {
        disagreements++;
        if (!example) example = `${q} × ${priceMinor} — العائم ${naive}، والصحيح ${exact}`;
      }
    }
  }

  eq(mismatchesAgainstExact, 0, "الحسابُ الصحيح يطابق المرجع في ١٦٠٬٠٠٠ حالة");
  ok(disagreements > 0,
     `والعائمُ يخالفه في ${disagreements} حالة — فالخطرُ حقيقيٌّ لا نظري`);
  if (example) console.log(`        مثال: ${example}`);
}

console.log("\n==========================================================================");
console.log("C) القيمةُ كما ستفحصها القاعدة");
console.log("==========================================================================");

{
  // ٧٫٥ طنّ × ٣٢٠٠٫٠٠ دولار = ٢٤٬٠٠٠٫٠٠
  const a = offerAmounts("7.5", "3200.00", 100)!;
  eq(a.quantityScaled, BigInt(75000), "الكمّية موسَّعة");
  eq(a.unitPriceMinor, BigInt(320000), "والسعرُ بالوحدة الصغرى");
  eq(a.valueMinor, BigInt(2400000), "والقيمةُ ٢٤٬٠٠٠ دولاراً");
  eq(formatMinor(a.valueMinor), "24,000.00", "ومقروءةً");

  // ٣٠٠ رأس × ١٢٠٫٠٠ = ٣٦٬٠٠٠٫٠٠ — القرارُ الذي اتّخذه المالك
  const sheep = offerAmounts("300", "120.00", 100)!;
  eq(sheep.valueMinor, BigInt(3600000), "٣٠٠ رأسٍ بالرأس");

  // ونفسُ القطيع بالكيلو: ٩٠٠٠ كجم × ٤٫٠٠
  const byKg = offerAmounts("9000", "4.00", 100)!;
  eq(byKg.valueMinor, sheep.valueMinor, "والقطيعُ نفسُه بالكيلو يعطي القيمةَ نفسَها");

  eq(offerAmounts("0", "1.00", 100), null, "كمّيةُ صفرٍ تُرفض قبل القاعدة");
  eq(offerAmounts("1", "0.00", 100), null, "وسعرُ صفر");
  eq(offerAmounts("abc", "1.00", 100), null, "وكمّيةٌ ليست عدداً");
  eq(offerAmounts("1", "1.005", 100), null, "وسعرٌ بكسرٍ أدقّ من العملة");
}

console.log("\n==========================================================================");
console.log("D) ذهاباً وإياباً");
console.log("==========================================================================");

for (const q of ["7.5", "0.0001", "128690", "1", "12.3456"]) {
  const scaled = parseDecimal(q, QUANTITY_SCALE)!;
  const back = quantityToString(scaled);
  ok(parseDecimal(back, QUANTITY_SCALE) === scaled, `${q} ← ${back}`);
}

console.log("\n==========================================================================");
console.log("E) قاعدةُ المضلَّع — بالرسالة التي يفهمها المزارع");
console.log("==========================================================================");

const origin = (over: Partial<Parameters<typeof originProblem>[0]> = {}) => ({
  plotRef: "KRD-11",
  areaHectares: "2.4",
  latitude: "13.183333",
  longitude: "30.216667",
  boundary: "",
  ...over,
});

eq(originProblem(origin()), null, "قطعةٌ دون ٤ هكتارات بنقطةٍ فقط");
ok(originProblem(origin({ areaHectares: "9.1" }))?.includes("أربعة هكتارات") === true,
   "وفوقها بلا مضلَّع — والرسالةُ تقول لماذا لا اسمَ القيد");
eq(originProblem(origin({ areaHectares: "9.1", boundary: '{"type":"Polygon"}' })), null,
   "والمضلَّعُ يفتحها");
// القيدُ في القاعدة `area_hectares < 4 or boundary is not null`. فأربعةٌ
// بالضبط **تطلب** مضلَّعاً، وهذا ما تقوله هذه الدالّةُ أيضاً — تطابقٌ متعمَّد،
// إذ لو تساهلت هنا لَقبِلت الشاشةُ ما ترفضه القاعدة.
ok(originProblem(origin({ areaHectares: "4" })) !== null,
   "وأربعةٌ بالضبط تطلب مضلَّعاً — الحدُّ «دون أربعة» لا «أربعةٌ فأقلّ»");
eq(originProblem(origin({ areaHectares: "3.9999" })), null,
   "وما دونها بقليلٍ يمرّ بنقطة");
ok(originProblem(origin({ latitude: "" })) !== null, "وبلا إحداثيّة");
ok(originProblem(origin({ plotRef: "  " })) !== null, "وبلا اسمِ قطعة");
eq(originProblem(origin({ latitude: "-1.5", longitude: "-30.2" })), null,
   "والإحداثيّاتُ السالبة تُقبل — نصفُ الكرة مسألةُ موقعٍ لا خطأ");

console.log("\n==========================================================================");
console.log("F) المرجع والحالات");
console.log("==========================================================================");

{
  const ref = offerReference(new Date("2026-09-03T10:00:00Z"), () => 0.5);
  ok(/^EXP-20260903-[0-9A-Z]{4}$/.test(ref), `شكلُ المرجع — ${ref}`);
  // مرجعٌ متسلسلٌ يُخبر كلَّ مشترٍ كم عرضاً حملت المنصّة يوماً. هذا لا يفعل.
  ok(!/-0*1$/.test(ref), "وليس عدّاداً يفضح حجم المنصّة");

  const statuses = Object.keys(OFFER_STATUS_LABEL);
  eq(statuses.length, 5, "الحالاتُ الخمس معنونة");
  ok(statuses.every((s) => s in OFFER_STATUS_HELP),
     "ولكلٍّ شرحٌ للمزارع — الاسمُ يصف فعلَ المراجع، والشرحُ يقول ماذا يفعل هو");
}

console.log("\n==========================================================================");
if (fail > 0) {
  console.log(`فشل ${fail} فحصاً.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
