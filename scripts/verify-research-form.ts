/**
 * مكتبة الدراسات والبحوث (البند ٢٠٢): نموذج «شارك دراستك» يقبل ما يقبله الجدول ويردّ ما يردّه، بكلامٍ يقول للمرسِل
 * أيّ خانةٍ يصلح — قبل أن يصل إلى القاعدة.
 *
 *   npx tsx scripts/verify-research-form.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkResearch, RESEARCH_KINDS, RESEARCH_PATH, type ResearchInput } from "../src/lib/research";

let failed = 0;
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${label}`);
  if (!c) failed++;
};

const good: ResearchInput = {
  kind: "feasibility",
  title: "جدوى زراعة السمسم في القضارف",
  authors: "فلان وزملاؤه",
  institution: "جامعة القضارف",
  year: "٢٠٢٥",
  language: "ar",
  crop: "السمسم",
  state: "القضارف",
  abstract: "درسنا تكلفة الفدان وعائده في ثلاثة مواسم، ووجدنا أنّ الريّ التكميليّ يرفع الغلّة بنحو الثلث.",
  file_path: "incoming/11111111-2222-3333-4444-555555555555.pdf",
  link_url: "",
  contact: "",
  consent: true,
};
const with_ = (p: Partial<ResearchInput>) => checkResearch({ ...good, ...p }, 2026);

console.log("ما يُقبل");
const r = with_({});
ok(r.ok && r.row.year === 2025, "عملٌ كامل يُقبل، والسنة بالأرقام العربيّة تُقرأ (٢٠٢٥)");
ok(r.ok && r.row.contact === null && r.row.link_url === null, "والخانات الفارغة تُكتب فراغاً لا نصّاً فارغاً");
ok(with_({ file_path: "", link_url: "https://example.org/study.pdf" }).ok, "والرابط وحده يكفي");
ok(with_({ title: "  جدوى   السمسم  " }).ok && (with_({ title: "  جدوى   السمسم  " }) as { row: { title: string } }).row.title === "جدوى السمسم",
  "والمسافات الزائدة تُطوى");

console.log("\nما يُردّ، وكلّ مرّةٍ بكلامٍ يقول ما يُصلح");
const refused = (p: Partial<ResearchInput>, label: string) => {
  const v = with_(p);
  ok(!v.ok && v.message[0].length > 5 && v.message[1].length > 5, label);
};
refused({ kind: "novel" }, "نوعٌ غير معروف");
refused({ title: "قصير" }, "عنوانٌ أقصر من ٥ أحرف");
refused({ title: "ع".repeat(201) }, "وأطول من ٢٠٠");
refused({ authors: "ع" }, "مؤلّفٌ بحرفٍ واحد");
refused({ year: "1900" }, "سنةٌ قبل ١٩٥٠");
refused({ year: "2030" }, "وبعد العام القادم");
refused({ abstract: "قصير جداً" }, "ملخّصٌ أقصر من ٤٠ حرفاً");
refused({ abstract: "ع".repeat(3001) }, "وأطول من ٣٠٠٠");
refused({ file_path: "c1/../secret.pdf" }, "ملفٌّ خارج مجلّد الوارد");
refused({ file_path: "", link_url: "http://example.org/a.pdf" }, "رابطٌ غير https");
refused({ file_path: "", link_url: "javascript:alert(1)" }, "ورابطٌ يُنفَّذ");
refused({ file_path: "", link_url: "" }, "بلا ملفٍّ ولا رابط");
refused({ consent: false }, "بلا إقرارٍ بحقّ النشر");

console.log("\nوهي حدود الجدول نفسها");
const sql = readFileSync(join(__dirname, "../supabase/migrations/20261026010000_research_library.sql"), "utf8");
for (const k of RESEARCH_KINDS) ok(sql.includes(`'${k}'`), `النوع ${k} في قيد الجدول`);
ok(/between 5 and 200/.test(sql) && /between 40 and 3000/.test(sql) && /between 1950 and 2100/.test(sql), "وأطوال العنوان والملخّص ومدى السنة");
ok(sql.includes("'^incoming/[0-9a-f-]{36}\\.pdf$'") && RESEARCH_PATH.test(good.file_path), "ومسار الملفّ نفسه");
ok(sql.includes("check (consent)"), "والإقرار شرطٌ في الجدول أيضاً");

console.log(failed ? `\n${failed} FAILED` : "\nALL CHECKS PASSED");
process.exit(failed ? 1 : 0);
