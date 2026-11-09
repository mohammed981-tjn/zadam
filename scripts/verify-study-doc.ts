/**
 * Checks that the studies published as written come through whole: the
 * title, every numbered section in the table of contents, the formulas set
 * apart, and not a list item lost.
 */
import { readFileSync } from "node:fs";
import { parseStudy } from "../src/lib/studyDoc";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nالمحلّل:");
const tiny = parseStudy("# عنوان\n## فرعي\n## أولاً: أ\nنص\n1. واحد\n2. اثنان\n- نقطة\n---\nx = y + 1\n### تفصيل\n# ثانياً: ب");
ok(tiny.title.join("|") === "عنوان|فرعي", "العنوان ما قبل القسم الأوّل");
ok(tiny.sections.map((s) => s.text).join("|") === "أولاً: أ|ثانياً: ب", "والأقسام المرقّمة بالكلمات أيّاً كان مستوى عنوانها");
ok(tiny.blocks.some((b) => b.kind === "ol" && b.items.length === 2), "والقائمة المرقّمة تُجمع");
ok(tiny.blocks.some((b) => b.kind === "formula" && b.text === "x = y + 1"), "والمعادلة سطرٌ مستقلّ");
ok(tiny.blocks.some((b) => b.kind === "h4" && b.text === "تفصيل"), "والعناوين الفرعية تبقى");

console.log("\nدراسة سعر الصرف:");
const md = readFileSync("content/studies/exchange-rate-ar.md", "utf8");
const doc = parseStudy(md);
ok(doc.title.length === 3 && doc.title[0] === "جمهورية السودان", "عنوانها ثلاثة أسطر");
ok(doc.sections.length === 19, `وأقسامها تسعة عشر (${doc.sections.length})`);
ok(doc.sections[0].text.startsWith("أولاً") && doc.sections.at(-1)!.text.startsWith("التاسع عشر"), "من «أولاً» إلى «التاسع عشر»");
ok(doc.blocks.filter((b) => b.kind === "formula").length === 3, "وفيها ثلاث معادلات");
const items = doc.blocks.reduce((a, b) => a + (b.kind === "ol" || b.kind === "ul" ? b.items.length : 0), 0);
const srcItems = md.split("\n").filter((l) => /^(\d+\.|-)\s/.test(l.trim())).length;
ok(items === srcItems, `ولا بندَ ضاع من القوائم (${items} من ${srcItems})`);
ok(md.includes("7,500 جنيه") && md.includes("51.28%"), "والأرقام كما كُتبت");

console.log("\nالجداول (البند ٢١٠):");
const tab = parseStudy("# ع\n## أولاً: أ\n| أ | ب |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n| ج | د |\n|:--|--:|\n| 5 | 6 |\nبعده نصّ");
const tables = tab.blocks.filter((b) => b.kind === "table");
ok(tables.length === 2, "جدولان يفصلهما سطرٌ فارغ لا يندمجان");
ok(tables[0]?.kind === "table" && tables[0].rows.length === 3 && tables[0].rows[0].join("|") === "أ|ب", "وصفّ العنوان أوّلاً، وسطر الفاصل ليس صفّاً");
ok(tab.blocks.at(-1)?.kind === "p", "والسطر بعد الجدول فقرة");

console.log("\nدراسة الكمبوست:");
const compost = parseStudy(readFileSync("content/studies/compost-ar.md", "utf8"));
ok(compost.sections.length === 12, `أقسامها اثنا عشر (${compost.sections.length})`);
ok(compost.blocks.filter((b) => b.kind === "table").every((b) => b.kind === "table" && b.rows.every((r) => r.length === b.rows[0].length)), "وكلّ صفٍّ في جداولها بعدد أعمدة عنوانه");
ok(readFileSync("content/studies/compost-ar.md", "utf8").includes("916,020"), "والنقد التراكمي للسيناريو B كما حُسب");

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
