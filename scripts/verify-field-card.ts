/**
 * بطاقة الحقل (البند ١٦٤): الفحوص تُقرأ على مقاييس الفاو المنشورة لا بحكمنا، والحدود تُفحص قبل الحفظ.
 *
 *   npx tsx scripts/verify-field-card.ts
 */
import { cropsAtSoilSalinity, phNormal, testProblem, waterSalinity } from "../src/lib/landTests";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

console.log("ماء الريّ (FAO-29 الجدول ١):");
ok(waterSalinity(0.2) === "none" && waterSalinity(0.69) === "none", "أقلّ من ٠٫٧: بلا قيد");
ok(waterSalinity(0.7) === "moderate" && waterSalinity(3.0) === "moderate", "من ٠٫٧ إلى ٣٫٠ بما فيهما: قيدٌ خفيف إلى متوسّط");
ok(waterSalinity(3.01) === "severe" && waterSalinity(12) === "severe", "فوق ٣٫٠: قيدٌ شديد");
ok(phNormal(6.5) && phNormal(8.4) && phNormal(7.4), "الحموضة الطبيعيّة ٦٫٥ إلى ٨٫٤");
ok(!phNormal(6.4) && !phNormal(8.5), "وما خارجها ليس طبيعيّاً");

console.log("\nمحاصيل تربةٍ ملحة (الجدول ٤):");
const low = cropsAtSoilSalinity(1.0).full.map((c) => c.key);
ok(low.includes("onion") && low.includes("cotton") && low.includes("wheat") && low.includes("carrot"), "عند ١٫٠ تعطي حاصلها كاملاً: البصل والقطن والقمح والجزر");
const mid = cropsAtSoilSalinity(5).full.map((c) => c.key);
ok(mid.includes("cotton") && mid.includes("wheat") && mid.includes("sorghum") && mid.includes("barley"), "عند ٥: القطن والقمح والذرة الرفيعة والشعير");
ok(!mid.includes("onion") && !mid.includes("tomato") && !mid.includes("maize"), "ولا البصل ولا الطماطم ولا الذرة الشامية");
const high = cropsAtSoilSalinity(7.9).full.map((c) => c.key);
ok(high.length === 1 && high[0] === "barley", "وعند ٧٫٩: الشعير وحده (٨٫٠) — القطن ٧٫٧ لا يكفي");
ok(cropsAtSoilSalinity(9).full.length === 0, "وفوق ٨ لا محصول في القائمة");
ok(cropsAtSoilSalinity(1).classOnly > 0, "ومحاصيل لها فئةٌ بلا رقم (السمسم وعبّاد الشمس…) تُعدّ ولا تُدخل");

console.log("\nالتحقّق قبل الحفظ:");
const day = new Date("2026-10-24T12:00:00Z");
const base = { kind: "water", testedOn: "2026-10-01", ec: 1.2, ph: 7.4, sar: null, organic: null };
ok(testProblem(base, day) === null, "فحصٌ سليم");
ok(testProblem({ ...base, kind: "air" }, day) === "kind", "نوعٌ غريب");
ok(testProblem({ ...base, testedOn: "2026-12-01" }, day) === "date", "تاريخٌ في المستقبل");
ok(testProblem({ ...base, testedOn: "1999-12-31" }, day) === "date", "وقبل عام ٢٠٠٠");
ok(testProblem({ ...base, testedOn: "الأمس" }, day) === "date", "وتاريخٌ لا يُقرأ");
ok(testProblem({ ...base, ec: null, ph: null }, day) === "empty", "بلا قيمةٍ واحدة");
ok(testProblem({ ...base, ph: 15 }, day) === "range" && testProblem({ ...base, ec: -1 }, day) === "range", "pH فوق ١٤ وملوحة سالبة");
ok(testProblem({ ...base, ec: NaN }, day) === "range", "وNaN");
ok(testProblem({ ...base, organic: 2 }, day) === "organic_water", "مادّة عضويّة في الماء");
ok(testProblem({ ...base, kind: "soil", organic: 2 }, day) === null, "وهي في التربة سليمة");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
