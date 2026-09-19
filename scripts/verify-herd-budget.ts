/**
 * ميزانيّةُ الدورة: تُقسَّم بنسبة العلف، والأجزاءُ تُساوي الكلّ — وتُصحَّح بعد الإنشاء.
 *
 *   npx tsx scripts/verify-herd-budget.ts
 *
 * WHY THIS EXISTS
 *
 * The owner opened a fattening cycle he had created and found «الميزانية 0»
 * beside «العلف التقديري 22,725 كجم», and every phase reading «١٬٠٩٠ كجم علف ·
 * ٠». He read it as a calculation that had stopped working.
 *
 * It had not. «الميزانية للرأس» is an optional field on the creation form; left
 * blank it is `Number("") === 0`, and zero apportioned across five phases is
 * five zeros. The feed beside it is genuinely computed, which is exactly what
 * makes the zeros look broken rather than empty.
 *
 * What *was* wrong is that the module had no edit path — `createHerd` and
 * `completeHerdStage` and nothing else — so the blank could never be filled and
 * the cycle carried zeros to its end.
 *
 * So `apportionBudget` came out of `planHerd` to be shared with `setHerdBudget`,
 * and this file holds it to the two properties that make the correction safe:
 * the split matches what planning would have produced, and the parts sum to the
 * whole.
 */

import { apportionBudget, planHerd } from "../src/lib/livestock";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const section = (t: string) =>
  console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

section("أ) القسمةُ بعد الإنشاء هي القسمةُ عند الإنشاء");

// أرقامُ الشاشة التي اشتكى منها: ضأن · تسمين · ١٠٠ رأس · ٢٠٢٦-٠٩-٠٧.
const plan = planHerd("sheep", "fattening", 100, "2026-09-07", 45000);
if (!plan) {
  console.log("  FAIL  planHerd أعادت null على مُدخلاتٍ صحيحة");
  process.exit(1);
}

const feeds = plan.stages.map((s) => s.feedKg);
const planned = plan.stages.map((s) => s.budget);
const redone = apportionBudget(feeds, 45000 * 100);

ok(
  JSON.stringify(redone) === JSON.stringify(planned),
  "تصحيحُ الميزانية يُعيد بناءَ القسمة نفسِها مرحلةً مرحلة",
);

section("ب) والأجزاءُ تُساوي الكلَّ — لا وحدةَ تضيع ولا تُخترع");

for (const total of [4_500_000, 1, 7, 999_999, 123_456_789]) {
  const parts = apportionBudget(feeds, total);
  ok(
    parts.reduce((a, b) => a + b, 0) === total,
    `المجموعُ ${total.toLocaleString("en-US")} يُقسَّم ويعود كما هو`,
  );
}

section("ج) والحالاتُ الطرفيّة لا تُنتج NaN");

ok(
  apportionBudget(feeds, 0).every((b) => b === 0),
  "ميزانيّةٌ صفرٌ تُنتج أصفاراً — وهي حالةُ الحقل المتروك فارغاً",
);

const noFeed = apportionBudget([0, 0, 0], 900);
ok(
  noFeed.every((b) => Number.isFinite(b)) &&
    noFeed.reduce((a, b) => a + b, 0) === 900,
  "وبلا علفٍ إطلاقاً لا قسمةَ على صفر — يذهب الكلُّ إلى الأخيرة",
);

ok(
  apportionBudget([], 500).length === 0,
  "ولا مراحلَ: مصفوفةٌ فارغةٌ لا انهيار",
);

const one = apportionBudget([12], 777);
ok(one.length === 1 && one[0] === 777, "ومرحلةٌ واحدةٌ تأخذ الكلَّ");

section("د) والعلفُ محسوبٌ فعلاً — فالأصفارُ كانت في المال وحده");

ok(
  feeds.reduce((a, b) => a + b, 0) > 0,
  `مجموعُ العلف ${feeds.reduce((a, b) => a + b, 0).toLocaleString("en-US")} كجم — والشاشةُ عرضته صحيحاً طوال الوقت`,
);
ok(plan.stages.length === 5, "وخمسُ مراحلَ لدورة التسمين");

console.log(
  `\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`,
);
process.exit(fail === 0 ? 0 : 1);
