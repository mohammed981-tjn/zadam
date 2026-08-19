import {
  safePagePath,
  FEEDBACK_KIND_LABEL,
  type FeedbackKind,
} from "../src/lib/feedback";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nمسار الصفحة المرفق بالملاحظة — ما يُقبل وما يُرفض\n");

console.log("يُقبل:");
ok(safePagePath("/tools/water") === "/tools/water", "مسار داخلي عادي");
ok(safePagePath("/") === "/", "الجذر");
ok(
  safePagePath("/seasons/42?tab=water") === "/seasons/42?tab=water",
  "مسار باستعلام",
);
ok(safePagePath("  /feedback  ") === "/feedback", "يُقلّم الفراغ حوله");

console.log("\nيُرفض:");
// The field is rendered beside the note in the admin panel. An absolute URL
// here would put someone else's link into the one screen an admin trusts.
ok(safePagePath("https://evil.example/x") === null, "عنوان مطلق لمضيف آخر");
ok(safePagePath("//evil.example") === null, "مسار بروتوكولي «//»");
// Browsers normalise a backslash to a slash, so "/\evil" reaches "//evil".
// The auth callback carries the same guard, and it was found there the hard way.
ok(safePagePath("/\\evil.example") === null, "الشرطة المائلة العكسية — تُطبَّع إلى //");
ok(safePagePath("\\\\evil.example") === null, "شرطتان عكسيتان");
ok(safePagePath("javascript:alert(1)") === null, "مخطّط javascript:");
ok(safePagePath("tools/water") === null, "مسار نسبي بلا شرطة بادئة");
ok(safePagePath("") === null, "نصّ فارغ");

console.log("\nالطول:");
const long = "/" + "a".repeat(500);
const capped = safePagePath(long);
ok(capped !== null && capped.length === 200, "يُقصّ عند ٢٠٠ حرف");

console.log("\nأنواع الملاحظات:");
const kinds = Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[];
ok(kinds.length === 3, "ثلاثة أنواع: اقتراح ومشكلة وسؤال");
ok(
  kinds.every((k) => FEEDBACK_KIND_LABEL[k].length > 0),
  "لكل نوع اسم عربي معروض",
);
ok(
  new Set(Object.values(FEEDBACK_KIND_LABEL)).size === kinds.length,
  "والأسماء متمايزة، فلا يظهر نوعان بنفس الكلمة",
);

console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
process.exit(fail === 0 ? 0 : 1);
