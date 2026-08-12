import {
  retrieveRelevant,
  normalizeArabic,
  type RetrievableEntry,
} from "../src/lib/retrieval";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const E = (
  crop: string,
  title: string,
  content: string,
  country = "السودان",
): RetrievableEntry => ({
  crop,
  topic: "general",
  title,
  content,
  source_country: country,
  source_note: null,
});

const kb: RetrievableEntry[] = [
  E(
    "ري",
    "تقنية بونجرو الهندية لحقن مياه الفيضان",
    "بونجرو بئر واسع يحقن مياه الجريان في الطبقة الجوفية ثم تسحب في الموسم الجاف",
    "الهند",
  ),
  E(
    "قطن",
    "التنقيط تحت الغطاء البلاستيكي في شينجيانغ",
    "القطن في شينجيانغ يروى بالتنقيط تحت غطاء بلاستيكي يقطع التبخر ويرفع الانتاجية",
    "الصين",
  ),
  E(
    "تخزين",
    "تخزين البصل الهندي",
    "البصل يفسد بسرعه والمخزن المهوى يخفض الفقد ويجب تجفيف الرقبه قبل التخزين",
    "الهند",
  ),
  E(
    "ثروة حيوانية",
    "نموذج امول للالبان",
    "الحليب يجمع يوميا وتقاس نسبه الدهون امام المربي ويدفع خلال 12 ساعه",
    "الهند",
  ),
  E(
    "ارز",
    "الارز الهجين الصيني",
    "الارز الهجين يعطي انتاجيه اعلى لكن البذره تشترى كل موسم",
    "الصين",
  ),
  E(
    "تربه",
    "نموذج كوبوتشي لمكافحه التصحر",
    "تثبيت الرمال بشبكات القش اولا ثم زراعه الشجيرات داخل المربعات",
    "الصين",
  ),
  E(
    "سمسم",
    "زراعه السمسم في السودان",
    "السمسم محصول تصديري مهم في القضارف وسنار",
  ),
  E("ذره", "الذره الرفيعه", "الذره الرفيعه محصول الغذاء الرئيسي في السودان"),
  E("قمح", "القمح المروي", "القمح يزرع شتاء في الشماليه والجزيره"),
  E(
    "فول سوداني",
    "الفول السوداني والافلاتوكسين",
    "الافلاتوكسين يسبب رفض الشحنات في اسواق التصدير",
  ),
  E(
    "ري",
    "دمج الماء والسماد",
    "حقن السماد الذائب في شبكه التنقيط يرفع كفاءه النيتروجين",
    "الصين",
  ),
  E(
    "ري",
    "الري الشمسي",
    "المضخات الشمسيه تفك الارتباط بشبكه الكهرباء",
    "الهند",
  ),
  E(
    "خضروات",
    "البيوت المحميه الشمسيه",
    "جدار شمالي سميك يخزن الحراره نهارا ويشعها ليلا",
    "الصين",
  ),
  E(
    "تسويق",
    "منظمات منتجي المزارع",
    "تجمع المزارعين لبيع الانتاج ككميه واحده كبيره",
    "الهند",
  ),
];

console.log("=".repeat(74));
console.log("A) Does it find the right entry?");
console.log("=".repeat(74));
const cases: [string, string][] = [
  ["ما هي تقنية بونجرو الهندية؟", "بونجرو"],
  ["كيف أزرع القطن بأقل ماء؟", "شينجيانغ"],
  ["ما أفضل طريقة لتخزين البصل؟", "البصل"],
  ["أريد معلومات عن الألبان والحليب", "امول"],
  ["كيف أوقف زحف الرمال؟", "كوبوتشي"],
  ["والقطن كيف يروى؟", "شينجيانغ"],
  ["ما مشكلة الأفلاتوكسين؟", "الافلاتوكسين"],
];
for (const [q, expect] of cases) {
  const top = retrieveRelevant(q, kb, 4);
  const hit = top.some(
    (e) => e.title.includes(expect) || e.content.includes(expect),
  );
  const rank = top.findIndex(
    (e) => e.title.includes(expect) || e.content.includes(expect),
  );
  ok(hit, `"${q}" -> found at rank ${rank + 1}: ${top[0]?.title.slice(0, 40)}`);
}

console.log("\n" + "=".repeat(74));
console.log("B) Arabic normalisation and prefix stripping");
console.log("=".repeat(74));
ok(normalizeArabic("الأرض") === normalizeArabic("الارض"), "alef forms unify");
ok(
  normalizeArabic("قريَة") === normalizeArabic("قريه"),
  "taa marbuta and diacritics unify",
);
ok(normalizeArabic("مصطفى") === normalizeArabic("مصطفي"), "yaa forms unify");
const withPrefix = retrieveRelevant("بالقطن", kb, 3);
ok(
  withPrefix.some((e) => e.crop === "قطن"),
  "'بالقطن' still matches 'قطن'",
);

console.log("\n" + "=".repeat(74));
console.log("C) Size, bounds and safety");
console.log("=".repeat(74));
ok(
  retrieveRelevant("القطن", kb, 4).length <= 4,
  "never returns more than the limit",
);
ok(
  retrieveRelevant("القطن", kb.slice(0, 3), 12).length === 3,
  "small base returned whole",
);
const offTopic = retrieveRelevant(
  "ما هو سعر صرف الدولار اليوم في البنك",
  kb,
  12,
);
ok(
  offTopic.length <= 6,
  `off-topic question sends a small sample only (${offTopic.length} entries)`,
);
ok(retrieveRelevant("", kb, 5).length <= 5, "empty question does not crash");
ok(
  retrieveRelevant("؟؟؟ !!!", kb, 5).length <= 5,
  "punctuation-only does not crash",
);

console.log("\n" + "=".repeat(74));
console.log("D) The saving that motivated this");
console.log("=".repeat(74));
const big: RetrievableEntry[] = [];
for (let i = 0; i < 47; i++)
  big.push(
    E(
      `محصول${i}`,
      `عنوان ${i}`,
      "نص ".repeat(200) + (i === 9 ? " بونجرو حقن المياه الجوفيه" : ""),
    ),
  );
const full = JSON.stringify(big).length;
const trimmed = JSON.stringify(
  retrieveRelevant("ما هي تقنية بونجرو؟", big, 12),
).length;
console.log(`  full base sent:      ${full.toLocaleString("en-US")} chars`);
console.log(`  after retrieval:     ${trimmed.toLocaleString("en-US")} chars`);
console.log(
  `  reduction:           ${Math.round((1 - trimmed / full) * 100)}%`,
);
ok(trimmed < full * 0.4, "cuts the payload by more than 60%");
ok(
  retrieveRelevant("ما هي تقنية بونجرو؟", big, 12).some((e) =>
    e.content.includes("بونجرو"),
  ),
  "the one relevant entry survives the cut",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
