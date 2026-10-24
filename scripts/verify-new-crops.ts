/**
 * المحاصيل السبعة عشر المضافة في ٢٤ أكتوبر (البند ١٥٦): كلّ رقمٍ في الكود مطابقٌ لملفّ المصادر
 * `content/crops/sourced-2026-10-24.json` الذي نُقل منه، وما أُسقط لنقص مصدره لم يدخل، ولكلّ محصولٍ اسمٌ
 * يُنادى به واسمٌ إنجليزيّ وشهرُ زراعةٍ معلَن.
 *
 *   npx tsx scripts/verify-new-crops.ts
 */
import { readFileSync } from "node:fs";
import { CROPS } from "../src/lib/agronomy";
import { SALT, SOWING } from "../src/lib/landCrops";
import { CROP_ALIASES, DEFAULT_PLANTING_MONTH, findByAlias } from "../src/lib/localAnswer";
import { normalizeArabic } from "../src/lib/retrieval";
import { cropName } from "../src/lib/farmLabelsEn";
import { CROP_EN } from "../src/lib/enNames";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

interface Included {
  key: string;
  name_ar: string;
  stages: number[];
  kc_ini: number;
  kc_mid: number;
  kc_end: number;
  sowing: { month0: number; source_url: string };
  salt: { cls: string; ece: number | null; source_url: string };
  sources: Record<string, string>;
  unsourced: string[];
}
const file = JSON.parse(readFileSync("content/crops/sourced-2026-10-24.json", "utf8")) as {
  included: Included[];
  excluded: { key: string; reason: string }[];
};

console.log("الملفّ:");
ok(file.included.length === 17 && file.excluded.length === 13, "١٧ محصولاً أُدخلت و١٣ أُسقطت، كما في التقرير");
ok(file.included.every((c) => c.unsourced.length === 0), "لا محصول داخلاً وفيه رقمٌ بلا مصدر");
ok(
  file.included.every((c) => ["growing_days", "water_need_kc", "sowing_months", "salt_tolerance"].every((f) => /^https?:\/\//.test(c.sources[f] ?? ""))),
  "ولكلّ رقمٍ من الأربعة رابطُ مصدرٍ يبدأ بـhttp",
);
ok(file.excluded.every((c) => c.reason.length > 20), "ولكلّ محصولٍ مُسقَط سببٌ مكتوب");

console.log("\nالكود كالملفّ:");
for (const c of file.included) {
  const crop = CROPS.find((x) => x.key === c.key);
  ok(!!crop, `${c.key}: في قائمة المحاصيل`);
  if (!crop) continue;
  ok(
    crop.stages.join() === c.stages.join() && crop.kcInitial === c.kc_ini && crop.kcMid === c.kc_mid && crop.kcEnd === c.kc_end,
    `${c.key}: المراحل ${c.stages.join("/")} وKc ${c.kc_ini}/${c.kc_mid}/${c.kc_end} كما في FAO-56`,
  );
  const salt = SALT[c.key];
  ok(!!salt && salt.cls === c.salt.cls && (salt.ece ?? null) === c.salt.ece, `${c.key}: الملوحة ${c.salt.cls}${c.salt.ece != null ? ` و${c.salt.ece}` : ""}`);
  if (c.key === "citrus") {
    ok(!(c.key in SOWING), "citrus: معمَّر بلا موعد غرس، فلا يُحسب موسمه في شهرٍ مُخمَّن");
    ok(DEFAULT_PLANTING_MONTH[c.key] === 0, "citrus: بداية الدورة يناير كالنخيل");
  } else {
    ok(SOWING[c.key]?.month === c.sowing.month0, `${c.key}: موعد الزراعة الشهر ${c.sowing.month0} كما في مصدره`);
    ok(DEFAULT_PLANTING_MONTH[c.key] === c.sowing.month0, `${c.key}: وشهر الجواب الافتراضيّ هو نفسه`);
  }
  ok((CROP_ALIASES[c.key] ?? []).length > 0, `${c.key}: له اسمٌ يُنادى به`);
  ok(cropName(c.key, "en") !== crop.name && cropName(c.key, "en") !== c.key && !!CROP_EN[c.key], `${c.key}: واسمه الإنجليزيّ (في الجدولين)`);
}

console.log("\nما أُسقط لم يدخل:");
for (const e of file.excluded) ok(!CROPS.some((c) => c.key === e.key), `${e.key}: ليس في القائمة (${e.reason.slice(0, 40)}…)`);
ok(CROPS.length === 29, "القائمة ٢٩ محصولاً: اثنا عشر وسبعة عشر");

console.log("\nالمناداة:");
const named = (q: string) => findByAlias(normalizeArabic(q), CROPS, CROP_ALIASES)?.key ?? null;
ok(named("كم يحتاج الخيار من الماء؟") === "cucumber", "«الخيار» تعني الخيار");
ok(named("وما هي خيارات الري المتاحة؟") === null, "و«خيارات» لا تعني الخيار");
ok(named("كم يحتاج الأرز في كوستي") === "rice" && named("زراعة بالأرز") === "rice", "«الأرز» و«بالأرز» تعنيان الأرز");
ok(named("اهتزاز التربة") === null && named("الاحتياج لمبارزة") === null, "وكلامٌ فيه حروفها ولا يخصّه لا يُفسَّر محصولاً");
ok(named("الجزر في هذا الموسم") === "carrot" && named("الجزائر والسودان") === null, "«الجزر» تعني الجزر و«الجزائر» لا");
ok(named("كم يحتاج الفول المصري") === "faba_bean" && named("كم يحتاج فول سوداني") === "groundnut", "«فول مصري» لا يُجاب بالفول السوداني");
ok(named("البطاطس") === "potato" && named("البطاطا الحلوة") === "sweet_potato", "البطاطس غير البطاطا");
ok(named("قريب فروت") === "citrus" && named("شمام") === "sweet_melon" && named("بطيخ") === "watermelon", "والموالح والشمّام والبطيخ");
ok(named("ذرة شامية") === "maize" && named("قمح") === "wheat", "والقديمة كما كانت");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
