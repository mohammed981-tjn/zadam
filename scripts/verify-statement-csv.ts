/**
 * قراءة كشف المزوّد CSV (البند ١٨٩): يجد أعمدة التاريخ والمبلغ بأسمائها العربيّة والإنجليزيّة، ويقرأ كلّ سطرٍ إلى يومٍ
 * ومبلغٍ صحيح بإشارته (موجبٌ داخل، سالبٌ خارج)، ولا يخمّن: سطرٌ لا يُقرأ يُذكر برقمه، وملفٌّ كثير السطور غير المقروءة يُرفض.
 *
 *   npx tsx scripts/verify-statement-csv.ts
 */
import { parseStatementAmount, parseStatementCsv, parseStatementDate, splitCsv, statementErrorMessage, MAX_STATEMENT_ROWS } from "../src/lib/ledger/statementCsv";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const t = (ar: string) => ar;

console.log("\nأ) التاريخ");
ok(parseStatementDate("2026-10-05") === "2026-10-05", "٢٠٢٦-١٠-٠٥ كما هو");
ok(parseStatementDate("2026/10/05") === "2026-10-05", "وبالشرطة المائلة");
ok(parseStatementDate("05/10/2026") === "2026-10-05", "واليوم أوّلاً (٥ أكتوبر لا ١٠ مايو)");
ok(parseStatementDate("5.10.26") === "2026-10-05", "وبالنقاط وسنةٍ برقمين");
ok(parseStatementDate("٠٥/١٠/٢٠٢٦") === "2026-10-05", "وبالأرقام العربيّة");
ok(parseStatementDate("2026-10-05T14:22:00") === "2026-10-05", "والوقت بعد اليوم يُترك");
ok(parseStatementDate("05/10/2026 14:22") === "2026-10-05", "والوقت بعد مسافة كذلك");
ok(parseStatementDate("31/02/2026") === null, "و٣١ فبراير ليس يوماً");
ok(parseStatementDate("13/13/2026") === null, "ولا الشهر الثالث عشر");
ok(parseStatementDate("أمس") === null, "ولا كلمة");
ok(parseStatementDate("") === null, "ولا خانة فارغة");

console.log("\nب) المبلغ");
const A = (s: string) => parseStatementAmount(s, "SDG");
ok(A("1,234.50") === BigInt(123450), "١٬٢٣٤٫٥٠ = ١٢٣٤٥٠ قرشاً");
ok(A("-1,234.50") === BigInt(-123450), "والسالب سالب");
ok(A("(1,234.50)") === BigInt(-123450), "وبين قوسين سالب");
ok(A("1234.5 DR") === BigInt(-123450), "وDR خارج");
ok(A("1234.5 CR") === BigInt(123450), "وCR داخل");
ok(A("١٬٢٣٤٫٥٠") === BigInt(123450), "وبالأرقام العربيّة وفواصلها");
ok(A("SDG 2,000") === BigInt(200000), "وكلمة العملة تُترك");
ok(A("+75") === BigInt(7500), "والموجب بإشارته");
ok(A("1.234") === null, "وثلاثة أرقامٍ بعد الفاصلة تُرفض، لا تُقرَّب");
ok(A("12,5") === null, "والفاصلة العشريّة الأوروبيّة لا تُخمَّن");
ok(A("abc") === null, "والكلام ليس مبلغاً");
ok(A("") === null, "ولا الفراغ");
ok(A("999999999999999") === null, "ولا ما فوق حدّ الدفتر");

console.log("\nج) تقسيم الخانات");
const cells = splitCsv('a,"b, c","d ""e"""\r\n1,2,3\n\n');
ok(cells.length === 2, "سطران، والفارغ يُترك");
ok(cells[0][1] === "b, c" && cells[0][2] === 'd "e"', "والخانة بين علامتي تنصيص تحمل الفاصلة والتنصيص");
ok(splitCsv("a;b;c\n1;2;3")[1].length === 3, "والفاصلة المنقوطة فاصلٌ إن كانت في العنوان");
ok(splitCsv("a\tb\n1\t2")[1][1] === "2", "والجدولة كذلك");

console.log("\nد) كشف بنكك بعمودٍ واحدٍ بإشارة");
{
  const csv = "﻿التاريخ,البيان,المبلغ,رقم العملية\n05/10/2026,تحويل وارد,\"25,000.00\",TX-1\n06/10/2026,شراء بذور,-7500,TX-2\n";
  const r = parseStatementCsv(csv, "SDG");
  ok(r.ok, "يُقرأ");
  if (r.ok) {
    ok(r.rows.length === 2, "سطران");
    ok(r.rows[0].date === "2026-10-05" && r.rows[0].minor === 2500000, "الأوّل: ٥ أكتوبر، داخلٌ ٢٥٬٠٠٠ جنيه");
    ok(r.rows[1].minor === -750000, "والثاني خارجٌ ٧٬٥٠٠");
    ok(r.rows[0].description === "تحويل وارد" && r.rows[0].reference === "TX-1", "بالبيان والمرجع");
    ok(r.columns.date === "التاريخ" && r.columns.amount === "المبلغ", "والأعمدة بأسمائها");
  }
}

console.log("\nهـ) كشف مصرفيّ بعمودين: سحب وإيداع");
{
  const csv = "Date,Description,Debit Amount,Credit Amount,Balance\n2026-10-01,Opening,,,1000.00\n2026-10-02,ATM,200.00,,800.00\n2026-10-03,Salary,,500.00,1300.00\n2026-10-04,Fee,-1.50,,1298.50\n";
  const r = parseStatementCsv(csv, "USD");
  ok(r.ok, "يُقرأ");
  if (r.ok) {
    ok(r.rows.length === 3, "ثلاث حركات");
    ok(r.rows[0].minor === -20000, "السحب خارج (٢٠٠$)");
    ok(r.rows[1].minor === 50000, "والإيداع داخل (٥٠٠$)");
    ok(r.rows[2].minor === -150, "والسحب المكتوب بالسالب خارجٌ أيضاً، لا داخل");
    ok(r.skipped.includes(2), "وسطر الرصيد الافتتاحيّ بلا حركة يُذكر ولا يُرفع");
    ok(r.columns.amount === "Debit Amount / Credit Amount", "و«Debit Amount» عمود السحب لا مبلغٌ بإشارة");
  }
}

console.log("\nو) ما لا يُفهم يُرفض");
{
  const noDate = parseStatementCsv("When,Amount\nx,1\n", "USD");
  ok(!noDate.ok && noDate.error === "no_date_column", "بلا عمود تاريخ");
  const noAmount = parseStatementCsv("Date,Note\n2026-10-01,x\n", "USD");
  ok(!noAmount.ok && noAmount.error === "no_amount_column", "وبلا عمود مبلغ");
  ok(!parseStatementCsv("Date,Amount\n", "USD").ok, "وبلا سطور");
  const lines = ["Date,Amount"];
  for (let i = 0; i < 10; i++) lines.push(i < 3 ? `x${i},5` : `2026-10-0${(i % 9) + 1},5`);
  const bad = parseStatementCsv(lines.join("\n"), "USD");
  ok(!bad.ok && bad.error === "too_many_bad_rows" && (bad.badLines ?? []).join() === "2,3,4", "وثلاثة سطورٍ غير مقروءة من عشرة: يُرفض بأرقامها");
  const oneBad = parseStatementCsv("Date,Amount\n2026-10-01,5\nyesterday,6\n2026-10-02,7\n", "USD");
  ok(oneBad.ok && oneBad.rows.length === 2 && oneBad.skipped.includes(3), "وسطرٌ واحد غير مقروء يُذكر والباقي يُقرأ");
  const long = ["Date,Amount", ...Array.from({ length: MAX_STATEMENT_ROWS + 1 }, () => "2026-10-01,1")].join("\n");
  const tooLong = parseStatementCsv(long, "USD");
  ok(!tooLong.ok && tooLong.error === "too_many_rows", "والأطول من الحدّ يُرفض");
  ok(statementErrorMessage("too_many_bad_rows", t, [2, 3]).includes("2، 3"), "والرسالة تذكر السطور");
}

if (failed > 0) {
  console.error(`\n${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("\nOK");
