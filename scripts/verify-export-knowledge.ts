/**
 * حارسُ الانجراف بين دراسة الصادر ومُدخلاتها في قاعدة المعرفة.
 *
 * WHY THIS EXISTS
 *
 * `src/lib/exportTrade.ts` opens by warning that a number written into a
 * paragraph drifts: a regulation's date moves, a share is restated, and the
 * prose keeps asserting what used to be true. Then
 * `20260903140000_export_corridor_knowledge.sql` writes those same numbers into
 * paragraphs — because that is what the assistant answers from, and an entry
 * that says «see the export page» answers nobody.
 *
 * So the same figure now lives in two files. That is a real risk and it is not
 * met with a promise to remember. It is met here: every figure the entries
 * assert must still be present in the module, and every source they cite must
 * be a source the module cites. Change one side alone and `npm test` fails,
 * naming the figure.
 *
 * Both sides are files in this repository, so this needs no database and no
 * credentials — it runs in CI on every push like every other verify script.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODULE_PATH = "src/lib/exportTrade.ts";
const MIGRATION_PATH =
  "supabase/migrations/20260903140000_export_corridor_knowledge.sql";

const study = readFileSync(join(ROOT, MODULE_PATH), "utf8");
const entries = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

let fail = 0;
function ok(cond: boolean, label: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
}

console.log(
  "\n==========================================================================",
);
console.log("A) كلُّ رقمٍ تؤكّده المُدخلات ما زال في الدراسة");
console.log(
  "==========================================================================",
);

/**
 * Each figure the entries assert, with the claim it carries. A figure removed
 * or restated in the module fails here rather than leaving the assistant
 * quoting a number the page no longer shows.
 *
 * Arabic-Indic digits are what both files use; comparing them as written is the
 * point — a figure retyped in Western digits on one side is itself a drift.
 */
const FIGURES: { figure: string; claim: string }[] = [
  { figure: "٧٠–٨٠٪", claim: "حصّة السودان من الصمغ العربي" },
  { figure: "١٢٨٬٦٩٠", claim: "رؤوس الضأن المصدَّرة إلى السعودية" },
  { figure: "٣٩٪", claim: "نصيب رفض الحدود من إخطارات الإنذار السريع" },
  { figure: "٦٥", claim: "حالات الرفض بسبب المستندات" },
  { figure: "٤ هكتارات", claim: "حدّ النقطة والمضلَّع في لائحة الغابات" },
  { figure: "30 ديسمبر 2026", claim: "موعد الشركات الكبرى" },
  { figure: "30 يونيو 2027", claim: "موعد المنشآت الصغيرة" },
  { figure: "31 ديسمبر 2020", claim: "تاريخ خطّ الأساس لإزالة الغابات" },
  { figure: "٦٠٫٥٪", claim: "حصّة النفط الخام في السلّة" },
  { figure: "١٤٫٧٪", claim: "حصّة الذهب" },
  { figure: "٨٫٩٪", claim: "حصّة الثروة الحيوانية" },
  { figure: "٥٫٦٪", claim: "حصّة السمسم" },
  { figure: "٣٫٢٪", claim: "حصّة الذرة الرفيعة" },
  { figure: "٢٫٨٪", claim: "حصّة القطن" },
  { figure: "2018", claim: "بدء إلزام «سابر»" },
  { figure: "ثلاثين يوماً", claim: "مهلة حصيلة الصادر، منطوقةً في المُدخلات" },
];

for (const { figure, claim } of FIGURES) {
  const inEntries = entries.includes(figure);
  const inStudy = study.includes(figure);

  if (!inEntries) {
    ok(false, `«${figure}» (${claim}) — غائبٌ عن المُدخلات، فلا شيء يُقارَن`);
    continue;
  }
  ok(
    inStudy,
    `«${figure}» (${claim}) — تؤكّده المُدخلات، و${inStudy ? "هو في الدراسة" : "الدراسةُ لم تعد تحمله"}`,
  );
}

// The thirty-day deadline is written as a numeral in the study and spelled out
// in the entries, so the pair above cannot check it in both directions. This
// does.
ok(
  study.includes("٣٠ يوماً") && entries.includes("ثلاثين يوماً"),
  "مهلةُ الثلاثين يوماً مذكورةٌ في الاثنين — رقماً في الدراسة ونطقاً في المُدخلات",
);

console.log(
  "\n==========================================================================",
);
console.log("B) كلُّ مصدرٍ تستشهد به المُدخلات مصدرٌ في الدراسة");
console.log(
  "==========================================================================",
);

const urlsIn = (text: string) =>
  new Set((text.match(/https:\/\/[^\s'"·)]+/g) ?? []).map((u) => u.replace(/[.,]$/, "")));

const studyUrls = urlsIn(study);
const entryUrls = [...urlsIn(entries)];

ok(entryUrls.length > 0, `المُدخلات تستشهد بمصادر (${entryUrls.length} رابطاً)`);

for (const url of entryUrls) {
  ok(
    studyUrls.has(url),
    `${url.slice(0, 72)}${url.length > 72 ? "…" : ""}`,
  );
}

console.log(
  "\n==========================================================================",
);
console.log("C) شكلُ المُدخلات — ما تفرضه القاعدة، مفحوصاً قبل أن تصل إليها");
console.log(
  "==========================================================================",
);

// Each row of the VALUES list starts a line with ('<crop>', '<topic>',
const rows = [...entries.matchAll(/^\('([^']*)'(?:::text)?,\s*'([^']*)'/gm)].map(
  (m) => ({ crop: m[1], topic: m[2] }),
);

ok(rows.length >= 13, `عددُ المُدخلات — ${rows.length}`);

/** The CHECK constraint on knowledge_entries.topic, mirrored. */
const TOPICS = new Set([
  "soil",
  "pest",
  "water",
  "variety",
  "institutional",
  "general",
  "agronomy",
  "technology",
  "livestock",
  "economics",
]);

const badTopics = rows.filter((r) => !TOPICS.has(r.topic));
ok(
  badTopics.length === 0,
  `كلُّ موضوعٍ ضمن ما يقبله قيدُ الجدول${badTopics.length ? ` — والمرفوض: ${badTopics.map((r) => r.topic).join(", ")}` : ""}`,
);

// Idempotency is anti-joined on title, so a duplicate title inside this one
// migration would insert only the first and silently drop the rest.
// Anchored on the row opener so this reads the third field — the title — and
// not any other quoted line. A looser pattern matched `source_country` instead
// and reported every repeated country as a duplicate title.
const titles = [
  ...entries.matchAll(
    /^\('[^']*'(?:::text)?,\s*'[^']*'(?:::text)?,\s*\n\s*'([^']*)'/gm,
  ),
].map((m) => m[1]);
const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
ok(
  dupes.length === 0,
  `لا عنوانَ مكرَّرٌ بين المُدخلات${dupes.length ? ` — والمكرَّر: ${dupes.join(" · ")}` : ""}`,
);

ok(
  entries.includes("where not exists"),
  "الإدراجُ محميٌّ بمانعِ تكرار — إعادةُ التطبيق لا تُدخل شيئاً",
);

// The whole reason these rows exist: the assistant answers from `content`. A
// row that points at the page instead of carrying the substance answers nobody.
ok(
  !/'انظر صفحة|'راجع صفحة|\/export'/.test(entries),
  "لا مُدخلَ يحيل القارئ إلى الصفحة بدل أن يجيبه",
);

console.log(
  "\n==========================================================================",
);
if (fail > 0) {
  console.log(`فشل ${fail} فحصاً.`);
  console.log(
    `الدراسة: ${MODULE_PATH}\nالمُدخلات: ${MIGRATION_PATH}\n` +
      "الرقمُ الذي فشل تغيّر في أحدهما دون الآخر — صحّح الاثنين معاً.",
  );
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
