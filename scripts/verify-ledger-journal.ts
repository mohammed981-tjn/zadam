/**
 * القيد اليدويّ (البند ٢٠٥): ما يقرؤه النموذج قبل أن يُرسل — في الموقع والتطبيق — يرفض ما ترفضه القاعدة بالكلمات نفسها،
 * والقيد الجاهز يملأ السطور من شجرة الدفتر ولا يملأ ما ليس فيها.
 *
 *   npx tsx scripts/verify-ledger-journal.ts
 */
import { readFileSync } from "node:fs";
import {
  auditSummary,
  choicesFor,
  entryErrorMessage,
  fillTemplate,
  parseEntry,
  postableAccounts,
  runningTotals,
  templatesFor,
  type ChartAccount,
  type EntryTemplate,
} from "../src/lib/ledger/journal";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const acc = (code: string, type: ChartAccount["type"], postable = true, system_key: string | null = null, extra: Partial<ChartAccount> = {}): ChartAccount => ({
  code,
  parent_code: null,
  name_ar: `حساب ${code}`,
  name_en: `Account ${code}`,
  type,
  postable,
  active: true,
  system_key,
  currency: null,
  provider: null,
  ...extra,
});
const chart: ChartAccount[] = [
  acc("11", "asset", false),
  acc("1110", "asset", true, "cash_on_hand", { provider: "cash" }),
  acc("1120", "asset", true, "bank", { provider: "bank" }),
  acc("1130", "asset", true, "wallet", { provider: "wallet" }),
  acc("1140", "asset", true, null, { provider: "bankak" }),
  acc("1210", "asset", true, "receivable_buyers"),
  acc("1240", "asset", true, "worker_advances"),
  acc("1310", "asset", true, "inventory_inputs"),
  acc("1150", "asset", true, null, { currency: "SDG" }),
  acc("2110", "liability", true, "payables_suppliers"),
  acc("4110", "revenue", true, "sales_crops"),
  acc("5110", "expense", true, "cost_seeds"),
  acc("5195", "expense", true, "cost_other", { active: false }),
  acc("9110", "equity", true, "memo_agreements"),
];

const base = { date: "2026-11-01", memo: "شراء بذور", currency: "USD", rate: "" };

console.log("الحسابات التي يُقيَّد عليها");
const usable = postableAccounts(chart).map((a) => a.code);
ok(!usable.includes("11"), "لا تجميعيّ");
ok(!usable.includes("5195"), "ولا موقوف");
ok(!usable.includes("9110"), "ولا إحصائيّ");
ok(usable.includes("5110") && usable.includes("1110"), "والباقي يُقيَّد عليه");
ok(choicesFor(chart, "money").map((a) => a.code).join(",") === "1110,1120,1130,1140", "النقد: النقد والبنك والمحفظة وما أُضيف بمزوّد");
ok(choicesFor(chart, "inventory").map((a) => a.code).join(",") === "1310", "والمخزون ما تحت ١٣");
ok(choicesFor(chart, "expense_or_inventory").map((a) => a.code).join(",") === "1310,5110", "والمصروف أو المخزون معاً");

console.log("قراءة القيد");
let r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "250" }, { account: "1110", side: "C", amount: "250.00" }] }, chart);
ok(r.ok && r.lines.length === 2 && r.lines[0].minor === 25000 && r.lines[1].minor === 25000, "قيدٌ متوازن يُقرأ بالسنت");
ok(r.ok && r.debit === BigInt(25000) && r.credit === BigInt(25000), "ومجموعاه متساويان");
r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "250" }, { account: "1110", side: "C", amount: "249.99" }] }, chart);
ok(!r.ok && r.error.code === "unbalanced", "وغير المتوازن يُرفض");
ok(!r.ok && r.error.code === "unbalanced" && entryErrorMessage(r.error, (a) => a, (m) => m.toString()) === "القيد غير متوازن: المدين 25000 والدائن 24999.", "بجملته");
r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "250" }] }, chart);
ok(!r.ok && r.error.code === "lines", "وسطرٌ واحد يُرفض");
r = parseEntry({ ...base, lines: [{ account: "11", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "account" && r.error.line === 1, "والتجميعيّ يُرفض بسطره");
r = parseEntry({ ...base, lines: [{ account: "5195", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "account", "والموقوف يُرفض");
r = parseEntry({ ...base, lines: [{ account: "1150", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "account", "وحسابٌ بالجنيه في قيدٍ بالدولار يُرفض");
r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "-5" }, { account: "1110", side: "C", amount: "-5" }] }, chart);
ok(!r.ok && r.error.code === "amount", "والسالب يُرفض");
r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "1.234" }, { account: "1110", side: "C", amount: "1.234" }] }, chart);
ok(!r.ok && r.error.code === "amount", "وكسرٌ أدقّ من السنت يُرفض");
r = parseEntry({ ...base, lines: [{ account: "5110", side: "D", amount: "٠" }, { account: "1110", side: "C", amount: "0" }] }, chart);
ok(!r.ok && r.error.code === "amount", "والصفر يُرفض");
r = parseEntry({ ...base, memo: "  ", lines: [{ account: "5110", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "memo", "والبيان الفارغ يُرفض");
r = parseEntry({ ...base, date: "2026-13-40", lines: [{ account: "5110", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "date", "والتاريخ غير الصالح يُرفض");
r = parseEntry(
  { ...base, lines: [{ account: "5110", side: "D", amount: "١٬٢٣٤٫٥٠" }, { account: "1110", side: "C", amount: "1,234.50" }, { account: "", side: "D", amount: "" }] },
  chart,
);
ok(r.ok && r.lines.length === 2 && r.lines[0].minor === 123450, "والأرقام العربيّة تُقرأ، والسطر الفارغ يُترك");
r = parseEntry({ ...base, currency: "SDG", rate: "٢٤٠٠", lines: [{ account: "5110", side: "D", amount: "6000" }, { account: "1110", side: "C", amount: "6000" }] }, chart);
ok(r.ok && r.currency === "SDG" && r.rate === "2400" && r.lines.every((l) => l.currency === "SDG"), "وبالجنيه بسعرٍ مكتوب");
r = parseEntry({ ...base, currency: "SDG", rate: "abc", lines: [{ account: "5110", side: "D", amount: "6000" }, { account: "1110", side: "C", amount: "6000" }] }, chart);
ok(!r.ok && r.error.code === "rate", "والسعر غير المقروء يُرفض");
r = parseEntry({ ...base, currency: "SDG", rate: "", lines: [{ account: "5110", side: "D", amount: "6000" }, { account: "1110", side: "C", amount: "6000" }] }, chart);
ok(r.ok && r.rate === null, "وبلا سعرٍ يُترك للسعر المنشور");
r = parseEntry({ ...base, currency: "EUR", lines: [{ account: "5110", side: "D", amount: "1" }, { account: "1110", side: "C", amount: "1" }] }, chart);
ok(!r.ok && r.error.code === "currency", "وعملةٌ غير الدولار والجنيه تُرفض");
const tot = runningTotals([{ account: "", side: "D", amount: "10" }, { account: "", side: "C", amount: "4" }, { account: "", side: "C", amount: "x" }], "USD");
ok(tot.debit === BigInt(1000) && tot.credit === BigInt(400), "والمجموع الجاري لا يعدّ ما لا يُقرأ");

console.log("القيود الجاهزة");
// The migration's own rows, read from its text: what the database holds is what is tried here.
const sql = readFileSync("supabase/migrations/20261106070000_ledger_manual_review.sql", "utf8");
const rows = [...sql.matchAll(/\('([a-z_]+)', '\{([a-z,]+)\}', '(daily|adjusting)', '([^']+)', '([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(\[[^']+\])', (\d+)\)/g)];
const templates: EntryTemplate[] = rows.map((m) => ({
  key: m[1],
  book_kinds: m[2].split(","),
  grp: m[3] as EntryTemplate["grp"],
  name_ar: m[4],
  name_en: m[5],
  hint_ar: m[6],
  hint_en: m[7],
  lines: JSON.parse(m[8]),
  sort: Number(m[9]),
}));
ok(templates.length === 13, `ثلاثة عشر قيداً جاهزاً في الهجرة (${templates.length})`);
const keys = templates.map((t) => t.key);
for (const k of ["purchase_credit", "pay_supplier", "sale_credit", "collect_customer", "worker_advance", "bank_deposit", "bank_withdrawal"]) {
  ok(keys.includes(k), `ومنها ${k}`);
}
ok(templates.filter((t) => t.grp === "adjusting").length === 6, "وستّ تسوياتٍ آخر الفترة");
ok(templates.every((t) => t.lines.filter((l) => l.side === "D").length >= 1 && t.lines.filter((l) => l.side === "C").length >= 1), "وفي كلٍّ مدينٌ ودائن");
ok(templatesFor(templates, "investor").map((t) => t.key).join(",") === "bank_deposit,bank_withdrawal", "ودفتر المستثمر له الإيداع والسحب");
const pay = templates.find((t) => t.key === "pay_supplier")!;
const filled = fillTemplate(pay, chart, "75");
ok(!!filled && filled[0].account === "2110" && filled[0].side === "D" && filled[1].account === "1110" && filled[1].side === "C", "سداد المورّد يملأ ٢١١٠ مديناً و١١١٠ دائناً");
ok(!!filled && filled.every((l) => l.amount === "75"), "والمبلغ نفسه على السطرين");
const parsedTpl = parseEntry({ ...base, lines: filled! }, chart);
ok(parsedTpl.ok, "والقيد الذي ملأه متوازن");
const shortChart = chart.filter((a) => a.system_key !== "worker_advances");
ok(fillTemplate(templates.find((t) => t.key === "worker_advance")!, shortChart) === null, "ودفترٌ ينقصه حساب القالب لا يُملأ");

console.log("سجلّ التدقيق بكلماته");
const id = (a: string) => a;
ok(auditSummary({ action: "draft_rejected", before: { status: "pending" }, after: { status: "rejected", note: "لا يطابق" } }, id) === "pending → rejected · السبب: لا يطابق", "الردّ بسببه");
ok(auditSummary({ action: "period_reopened", before: { closed_through: "2026-10-31" }, after: { closed_through: null, reason: "تصحيح" } }, id) === "2026-10-31 → غير مقفل · السبب: تصحيح", "وإعادة الفتح بسببها");
ok(auditSummary({ action: "lines_posted", before: null, after: { debit: 2500, credit: 2500, lines: [{ account: "5110", side: "D" }, { account: "1110", side: "C" }] } }, id).includes("+5110 −1110"), "والسطور بحساباتها");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
