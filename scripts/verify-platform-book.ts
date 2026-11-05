/**
 * الدفتر العامّ للمنصّة والمحافظ (البند ١٨٩): نموذج رسم المدير يُقرأ بالوحدة الصغرى ولا يُخمَّن، وخلاصة المطابقة تجمع
 * ما في الكشف وما في الدفتر كلّاً بعملته، والمطابقة اليدويّة لا تعرض إلا قيداً بالمبلغ نفسه وإشارته وعملته، الأقرب يوماً أوّلاً.
 *
 *   npx tsx scripts/verify-platform-book.ts
 */
import { candidatesFor, feeFormMessage, parseFeeForm, summarise, type ReconRow } from "../src/lib/ledger/platformBook";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const today = "2026-10-25";
const base = {
  payer: "b1000000-0000-0000-0000-0000000000B1",
  payerKind: "investor",
  kind: "inspection",
  amount: "1,500",
  currency: "SDG",
  date: "2026-10-20",
  rate: "",
  memo: "  معاينة  ",
};

console.log("\nأ) نموذج الرسم");
{
  const r = parseFeeForm(base, today);
  ok(r.ok, "يُقرأ");
  if (r.ok) {
    ok(r.args.amountMinor === 150000, "١٬٥٠٠ جنيه = ١٥٠٬٠٠٠ قرش");
    ok(r.args.rate === null, "والسعر الفارغ يُترك للمنشور");
    ok(r.args.payer === "b1000000-0000-0000-0000-0000000000b1", "والمعرّف بحروفٍ صغيرة");
    ok(r.args.memo === "معاينة", "والملاحظة بلا فراغات حولها");
  }
  const rate = parseFeeForm({ ...base, rate: "٢٤٥٠٫٥" }, today);
  ok(rate.ok && rate.args.rate === 2450.5, "والسعر بالأرقام العربيّة يُقرأ");
  const usdRate = parseFeeForm({ ...base, currency: "USD", rate: "2450" }, today);
  ok(usdRate.ok && usdRate.args.rate === null, "والدولار لا سعر صرفٍ له");
  const fail = (patch: Partial<typeof base>, e: string, label: string) => {
    const r = parseFeeForm({ ...base, ...patch }, today);
    ok(!r.ok && r.error === e, label);
  };
  fail({ payer: "x" }, "payer", "دافعٌ غير معروف يُرفض");
  fail({ payerKind: "platform" }, "payer_kind", "ودفتر المنصّة ليس دفتر دافع");
  fail({ kind: "gift" }, "kind", "ونوعٌ غير معروف");
  fail({ currency: "EUR" }, "currency", "وعملةٌ غير معروفة");
  fail({ amount: "0" }, "amount", "ومبلغ صفر");
  fail({ amount: "12.345" }, "amount", "وثلاث خاناتٍ بعد الفاصلة لا تُقرَّب");
  fail({ amount: "-5" }, "amount", "والسالب");
  fail({ date: "2026-10-26" }, "date", "ويومٌ قادم");
  fail({ date: "2026-02-30" }, "date", "ويومٌ ليس في التقويم");
  fail({ rate: "0.5" }, "rate", "وسعرٌ دون الواحد");
  ok(feeFormMessage("rate").includes("فارغاً"), "والرسالة تقول ما يُفعل");
  const kinds = ["payer", "payer_kind", "kind", "currency", "amount", "date", "rate"] as const;
  ok(
    kinds.every((k) => feeFormMessage(k, "en").length > 0 && !/[\u0600-\u06FF]/.test(feeFormMessage(k, "en"))),
    "وبالإنجليزية لكلّ خطأٍ رسالةٌ بلا حرفٍ عربيّ",
  );
  ok(feeFormMessage("rate", "en").includes("blank"), "والإنجليزيّة تقول ما يُفعل أيضاً");
}

console.log("\nب) خلاصة المطابقة");
const row = (status: ReconRow["status"], amount: number, date: string, extra: Partial<ReconRow> = {}): ReconRow => ({
  status,
  statement_line: status === "book_only" ? null : `s-${date}-${amount}`,
  journal_line: status === "statement_only" ? null : `j-${date}-${amount}`,
  txn_date: date,
  amount_minor: amount,
  currency: "SDG",
  description: "",
  reference: "",
  entry_no: status === "statement_only" ? null : 1,
  entry_date: status === "statement_only" ? null : date,
  memo: null,
  match_kind: status === "matched" ? "auto" : null,
  ...extra,
});
{
  const rows = [
    row("matched", -2500, "2026-10-01"),
    row("matched", 10000, "2026-10-02"),
    row("statement_only", -99, "2026-10-03"),
    row("book_only", -300, "2026-10-04"),
    row("statement_only", 500, "2026-10-05", { currency: "USD" }),
  ];
  const s = summarise(rows);
  ok(s.matched === 2 && s.statementOnly === 2 && s.bookOnly === 1, "اثنان في الاثنين، واثنان في الكشف وحده، وواحد في الدفتر وحده");
  ok(s.totals.SDG.statement === BigInt(-2500 + 10000 - 99), "الكشف بالجنيه: ما طوبق وما فيه وحده");
  ok(s.totals.SDG.book === BigInt(-2500 + 10000 - 300), "والدفتر بالجنيه: ما طوبق وما فيه وحده");
  ok(s.totals.USD.statement === BigInt(500) && s.totals.USD.book === BigInt(0), "وكلّ عملةٍ وحدها، لا تُجمع بغيرها");
}

console.log("\nج) ما يُعرض للمطابقة اليدويّة");
{
  const line = row("statement_only", -2500, "2026-10-10");
  const rows = [
    line,
    row("book_only", -2500, "2026-10-02", { entry_no: 4 }),
    row("book_only", -2500, "2026-10-12", { entry_no: 9 }),
    row("book_only", 2500, "2026-10-10", { entry_no: 5 }),
    row("book_only", -2500, "2026-10-10", { currency: "USD", entry_no: 6 }),
    row("matched", -2500, "2026-10-10", { entry_no: 7 }),
    row("book_only", -2501, "2026-10-10", { entry_no: 8 }),
  ];
  const c = candidatesFor(line, rows);
  ok(c.length === 2, "قيدان فقط: بالمبلغ نفسه وإشارته وعملته، وغير مطابَقَين");
  ok(c[0]?.entry_no === 9 && c[1]?.entry_no === 4, "الأقرب يوماً أوّلاً (يومان قبل ثمانية)");
  ok(!c.some((r) => r.amount_minor > 0), "والداخل لا يُعرض لخارج");
}

if (failed > 0) {
  console.error(`\n${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("\nOK");
