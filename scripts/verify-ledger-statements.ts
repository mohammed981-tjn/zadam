/**
 * القوائم الماليّة تُرتَّب من أرقام القاعدة بالأعداد الصحيحة وتقول إن لم تتوازن، والتصدير لا يُنتج صيغةً (البند ١٨٧ ٢د).
 * الأرقام هي أرقام بوّابة القاعدة `verify-ledger-reports.sql`، فتتّفق الطبقتان.
 *
 *   npx tsx scripts/verify-ledger-statements.ts
 */
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
  cashBalance,
  money,
  moneyCell,
  toCsv,
  type BalanceRow,
  type CashFlowRow,
  type IncomeRow,
  type TrialRow,
} from "../src/lib/ledger/reports";
import { dayBefore, isIsoDate, parseReportParams, reportHref } from "../src/lib/ledger/reportParams";
import { ledgerToday } from "../src/lib/ledger/today";
import { reportToCsv, type ReportData } from "../src/lib/ledger/reportData";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const inc = (code: string, key: string, type: "revenue" | "expense", amount: number): IncomeRow => ({ code, name_ar: key, name_en: key, type, system_key: key, amount });
const bal = (code: string, key: string, type: "asset" | "liability" | "equity", balance: number): BalanceRow => ({ code, name_ar: key, name_en: key, type, system_key: key, balance });
const cf = (section: CashFlowRow["section"], code: string, amount: number): CashFlowRow => ({ section, code, name_ar: code, name_en: code, amount });

console.log("\nأ) قائمة الدخل");
const is = buildIncomeStatement([
  inc("4110", "sales_crops", "revenue", 68000),
  inc("5110", "cost_seeds", "expense", 25000),
  inc("5140", "cost_labour", "expense", 10000),
  inc("5900", "costs_capitalised", "expense", -35000),
]);
ok(is.totalRevenue === BigInt(68000), "الإيراد ٦٨٠$");
ok(is.totalExpense === BigInt(0), "وصافي المصروف صفر بعد الرسملة");
ok(is.netIncome === BigInt(68000), "وصافي الدخل ٦٨٠$");
ok(is.revenue.length === 1 && is.expense.length === 3, "والسطور موزّعة بنوعها");
const loss = buildIncomeStatement([inc("4110", "s", "revenue", 100), inc("5800", "c", "expense", 250)]);
ok(loss.netIncome === BigInt(-150), "والخسارة سالبة");
ok(buildIncomeStatement([]).netIncome === BigInt(0), "وقائمةٌ فارغة صفر");

console.log("\nب) الميزانيّة");
const rows: BalanceRow[] = [
  bal("1110", "cash_on_hand", "asset", 10000),
  bal("1120", "bank", "asset", 95000),
  bal("1210", "receivable_buyers", "asset", 8000),
  bal("1410", "crops_in_progress", "asset", 35000),
  bal("1510", "machinery", "asset", 30000),
  bal("2110", "payables_suppliers", "liability", 10000),
  bal("3110", "owner_capital", "equity", 100000),
];
const bs = buildBalanceSheet(rows, is.netIncome);
ok(bs.totalAssets === BigInt(178000), "الأصول ١٬٧٨٠$");
ok(bs.totalLiabilities === BigInt(10000), "والالتزامات ١٠٠$");
ok(bs.totalEquity === BigInt(100000), "والملكيّة ١٬٠٠٠$");
ok(bs.totalEquityWithIncome === BigInt(168000), "ومعها صافي الدخل غير المقفل ١٬٦٨٠$");
ok(bs.balanced, "الأصول = الالتزامات + الملكيّة + صافي الدخل");
ok(!buildBalanceSheet(rows, BigInt(0)).balanced, "وبلا صافي الدخل لا تتوازن (فتقول ذلك)");
ok(!buildBalanceSheet([...rows, bal("1130", "wallet", "asset", 1)], is.netIncome).balanced, "وقرشٌ زائد يكسرها");
ok(buildBalanceSheet([], BigInt(0)).balanced, "وميزانيّةٌ فارغة متوازنة");

console.log("\nج) التدفّقات النقديّة");
const flow = [
  cf("operating", "4110", 60000),
  cf("operating", "5110", -25000),
  cf("financing", "3110", 100000),
  cf("investing", "1510", -30000),
];
const cash = cashBalance(rows);
ok(cash === BigInt(105000), "رصيد النقد من الميزانيّة ١٬٠٥٠$ (نقد + بنك)");
const cfs = buildCashFlow(flow, BigInt(0), cash);
ok(cfs.totalOperating === BigInt(35000) && cfs.totalFinancing === BigInt(100000) && cfs.totalInvesting === BigInt(-30000), "التشغيل ٣٥٠ والتمويل ١٬٠٠٠ والاستثمار −٣٠٠");
ok(cfs.net === BigInt(105000), "وصافي الحركة ١٬٠٥٠$");
ok(cfs.ties, "والأوّل + الحركة = الآخر");
ok(!buildCashFlow(flow, BigInt(1), cash).ties, "ورصيدُ أوّلٍ خاطئ لا يتطابق");
const period = buildCashFlow([cf("operating", "4110", 50000), cf("operating", "5110", -25000), cf("financing", "3110", 100000), cf("investing", "1510", -30000)], BigInt(10000), BigInt(105000));
ok(period.ties && period.net === BigInt(95000), "وفترةٌ تبدأ برصيد ١٠٠$: حركتها ٩٥٠$ وتتطابق");

console.log("\nد) ميزان المراجعة");
const tr: TrialRow[] = [
  { code: "1110", name_ar: "a", name_en: "a", type: "asset", debit_balance: 500, credit_balance: 0 },
  { code: "3110", name_ar: "b", name_en: "b", type: "equity", debit_balance: 0, credit_balance: 500 },
  { code: "9120", name_ar: "m", name_en: "m", type: "equity", debit_balance: 12345, credit_balance: 0 },
  { code: "9210", name_ar: "m", name_en: "m", type: "equity", debit_balance: 0, credit_balance: 12345 },
];
const tb = buildTrialBalance(tr);
ok(tb.rows.length === 2 && tb.memo.length === 2, "الحسابات الإحصائيّة ٩xxx تُفصل عن الحقيقيّة");
ok(tb.balanced && tb.totalDebit === BigInt(500), "والميزان الحقيقيّ متوازن بدونها");
ok(!buildTrialBalance([tr[0]]).balanced, "ومدينٌ بلا دائن يُكشف");

console.log("\nه) العرض والتصدير");
ok(money(BigInt(123456)) === "1,234.56", "العرض بخانتين وفاصل آلاف: 1,234.56");
ok(money(-5) === "-0.05", "والسالب: -0.05");
const csv = toCsv([
  ["الحساب", "المبلغ"],
  ["بذور, وأسمدة", moneyCell(-123450)],
  ['قال "نعم"', moneyCell(5)],
  ["=SUM(A1:A9)", 7],
  ["+cmd", null],
  ["سطرٌ\nمنقسم", moneyCell(0)],
]);
ok(csv.startsWith("﻿"), "يبدأ بعلامة UTF-8 ليقرأ إكسل العربيّة");
ok(csv.includes('"بذور, وأسمدة",-1234.50\r\n'), "الفاصلة في النصّ تُقتبس، والمبلغ رقمٌ بإشارته");
ok(csv.includes('"قال ""نعم""",0.05\r\n'), "وعلامة الاقتباس تُضاعَف");
ok(csv.includes("'=SUM(A1:A9),7\r\n"), "وما يبدأ بـ= يصير نصّاً لا صيغة");
ok(csv.includes("'+cmd,\r\n"), "وكذلك + (والخليّة الفارغة فارغة)");
ok(csv.includes('"سطرٌ\nمنقسم",0.00\r\n'), "والسطر الجديد داخل الخليّة يُقتبس");
ok(csv.endsWith("\r\n") && !csv.endsWith("\r\n\r\n"), "ويُنهى بسطرٍ واحد");

console.log("\nو) ما في العنوان لا يُوثَق به");
{
  const today = "2026-10-24";
  const d = parseReportParams({}, today);
  ok(d.report === "trial" && d.from === "2026-01-01" && d.to === today && d.asOf === today && d.page === 1 && d.kind === null, "بلا شيء: ميزان المراجعة، من أوّل السنة إلى اليوم");
  ok(parseReportParams({ r: "income" }, today).report === "income", "تقريرٌ معروف يمرّ");
  ok(parseReportParams({ r: "drop table" }, today).report === "trial", "ومجهولٌ يعود إلى الميزان");
  ok(parseReportParams({ r: "account" }, today).report === "chart", "وكشف حسابٍ بلا حساب يعود إلى الشجرة");
  const acct = "2b1c0f3e-aaaa-4bbb-8ccc-0123456789ab";
  const a = parseReportParams({ r: "account", a: acct }, today);
  ok(a.report === "account" && a.account === acct, "وبحسابٍ صحيح يمرّ");
  ok(parseReportParams({ r: "account", a: "1; drop" }, today).account === null, "ومعرّفٌ ليس uuid يُهمَل");
  ok(isIsoDate("2026-02-28") && !isIsoDate("2026-02-31") && !isIsoDate("2026-2-3") && !isIsoDate(undefined) && !isIsoDate("1999-01-01"), "التاريخ يومٌ حقيقيّ بعد عام ٢٠٠٠");
  const bad = parseReportParams({ from: "2026-13-01", to: "x", as_of: "2026-02-30" }, today);
  ok(bad.from === "2026-01-01" && bad.to === today && bad.asOf === today, "وتاريخٌ فاسد يعود إلى الافتراضيّ");
  const rev = parseReportParams({ from: "2026-09-01", to: "2026-03-01" }, today);
  ok(rev.from === "2026-03-01" && rev.to === "2026-09-01", "وفترةٌ مقلوبة تُعدَّل");
  ok(parseReportParams({ p: "0" }, today).page === 1 && parseReportParams({ p: "-3" }, today).page === 1 && parseReportParams({ p: "2.5" }, today).page === 1 && parseReportParams({ p: "999999" }, today).page === 1, "ورقم الصفحة عددٌ صحيح صغير");
  ok(parseReportParams({ p: "7" }, today).page === 7, "٧ تمرّ");
  ok(parseReportParams({ book: "platform" }, today).kind === "platform" && parseReportParams({ book: "bank" }, today).kind === null, "ونوع الدفتر من القائمة");
  ok(dayBefore("2026-03-01") === "2026-02-28" && dayBefore("2024-03-01") === "2024-02-29" && dayBefore("2026-01-01") === "2025-12-31", "اليوم السابق عبر الشهر والسنة الكبيسة");
  ok(reportHref("/books", { report: "trial" }, today) === "/books?r=trial", "الرابط بلا زوائد حين لا يختلف شيء");
  ok(reportHref("/books", { report: "income", from: "2026-03-01", to: today, page: 3, kind: "platform" }, today) === "/books?r=income&book=platform&from=2026-03-01&p=3", "ويكتب المختلف وحده");
}

console.log("\nز) يوم الخرطوم، وملف التصدير");
{
  ok(ledgerToday(new Date("2026-10-24T10:00:00Z")) === "2026-10-24", "عند العاشرة بالتوقيت العالمي: يوم ٢٤");
  ok(ledgerToday(new Date("2026-10-24T21:59:59Z")) === "2026-10-24", "قبل منتصف ليل الخرطوم بثانية: ما زال ٢٤");
  ok(ledgerToday(new Date("2026-10-24T22:00:00Z")) === "2026-10-25", "ومنتصف الليل في الخرطوم: ٢٥ (والخادم ما زال في ٢٤)");
  ok(ledgerToday(new Date("2026-12-31T23:30:00Z")) === "2027-01-01", "وعبر رأس السنة");

  const income: ReportData = { kind: "income", statement: is };
  const c1 = reportToCsv(income);
  ok(c1.includes("4110,sales_crops,إيراد,680.00\r\n"), "قائمة الدخل: صفّ الإيراد برمزه واسمه ومبلغه");
  ok(c1.includes("إيراد,680.00\r\n") && c1.includes("مجموع الإيراد,,680.00\r\n") && c1.includes("صافي الدخل,,680.00\r\n"), "قائمة الدخل: السطور والمجاميع بالدولار");
  ok(c1.includes("5900,costs_capitalised,مصروف,-350.00"), "والمرسمل سالبٌ بإشارته");
  const trialCsv = reportToCsv({ kind: "trial", trial: tb });
  ok(trialCsv.includes("9120,m,ملكيّة,123.45,0.00") && trialCsv.includes(",المجموع,,5.00,5.00\r\n"), "ميزان المراجعة: الإحصائيّ في آخره، والمجموع للحقيقيّ وحده");
  const jr = reportToCsv({
    kind: "journal",
    hasMore: false,
    entries: [{ id: "x", entry_no: 7, entry_date: "2026-10-01", memo: "=HYPERLINK(1)", reversal_of: null, fx_rate: null, lines: [{ line_no: 1, code: "1110", account: "نقد", side: "D", currency: "USD", amount_minor: 500, base_minor: 500 }] }],
  });
  ok(jr.includes("7,2026-10-01,'=HYPERLINK(1),1110,نقد,5.00,,USD,5.00"), "اليوميّة: بيانٌ يبدأ بـ= لا يصير صيغة، والمدين في عموده");
  const sn = reportToCsv({ kind: "seasons", rows: [{ season_id: "s", name: "قمح", revenue: 6000, expense: 3000 }] });
  ok(sn.includes("قمح,60.00,30.00,30.00\r\n"), "ربحيّة المواسم: الربح = الإيراد − المصروف");
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
