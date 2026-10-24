/**
 * ما يكتبه المزارع في نموذج القيد يصل القاعدة كما هو أو يُرفض بسببه — لا يُقرَّب ولا يُسقَط (البند ١٨٧ ٢ج).
 *
 *   npx tsx scripts/verify-ledger-entry-input.ts
 */
import {
  isSettleFrom,
  ledgerEntryInputMessage,
  parseLedgerEntryInput,
  parseSettleRate,
  type LedgerEntryInputError,
} from "../src/lib/ledgerEntryInput";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const parse = (amount: string, currency = "USD", paid_from = "cash", fx_rate = "") =>
  parseLedgerEntryInput({ amount, currency, paid_from, fx_rate });
const refused = (r: ReturnType<typeof parse>, why: LedgerEntryInputError) => !r.ok && r.error === why;

console.log("\nأ) بالدولار");
{
  const r = parse("1500");
  ok(r.ok && r.money.amount === "1500.00" && r.money.entered_amount === null && r.money.fx_rate === null, "1500 → 1500.00، بلا مبلغ مُدخَل ولا سعر");
  const g = parse("1,500.5");
  ok(g.ok && g.money.amount === "1500.50", "الفاصلة تُقبل: 1,500.5 → 1500.50");
  const a = parse("١٢٣٫٥");
  ok(a.ok && a.money.amount === "123.50", "الأرقام العربيّة: ١٢٣٫٥ → 123.50");
  ok(refused(parse("12.345"), "amount"), "ثلاثة كسور عشريّة تُرفض ولا تُقرَّب");
  ok(refused(parse("0"), "amount"), "الصفر يُرفض");
  ok(refused(parse(""), "amount"), "الفراغ يُرفض");
  ok(refused(parse("-5"), "amount"), "السالب يُرفض");
  ok(refused(parse("abc"), "amount"), "غير الرقم يُرفض");
  ok(refused(parse("1e3"), "amount"), "الأسّ يُرفض");
  ok(refused(parse("999999999999999"), "amount"), "ما يفوق الحدّ يُرفض");
  const typedRate = parse("100", "USD", "cash", "2500");
  ok(typedRate.ok && typedRate.money.fx_rate === null, "سعر مكتوب مع الدولار يُهمَل");
}

console.log("\nب) بالجنيه");
{
  const r = parse("1500000", "SDG");
  ok(
    r.ok && r.money.currency === "SDG" && r.money.entered_amount === "1500000.00" && r.money.fx_rate === null && r.money.amount === "0",
    "الجنيه بلا سعر: المبلغ يذهب إلى entered_amount والقاعدة تأخذ السعر المنشور",
  );
  const t = parse("2,500.75", "SDG", "bank", "2,450.5");
  ok(t.ok && t.money.entered_amount === "2500.75" && t.money.fx_rate === "2450.5" && t.money.paid_from === "bank", "مبلغ وسعر مكتوبان");
  ok(refused(parse("100", "SDG", "cash", "0.5"), "rate"), "سعر دون واحد يُرفض");
  ok(refused(parse("100", "SDG", "cash", "abc"), "rate"), "سعر غير رقم يُرفض");
  ok(refused(parse("100", "SDG", "cash", "1.1234567"), "rate"), "سبعة كسور في السعر تُرفض");
  ok(refused(parse("100", "SDG", "cash", "999999999"), "rate"), "سعر فوق الحدّ يُرفض");
  ok(refused(parse("100.123", "SDG"), "amount"), "ثلاثة كسور بالجنيه تُرفض");
}

console.log("\nج) العملة وجهة الدفع");
{
  const old = parse("50", "", "");
  ok(old.ok && old.money.currency === "USD" && old.money.paid_from === "cash", "نموذجٌ قديم بلا عملة ولا جهة: دولار ونقداً");
  ok(refused(parse("50", "EUR"), "currency"), "عملة غير معروفة تُرفض");
  ok(refused(parse("50", "USD", "cheque"), "paid_from"), "جهة دفع غير معروفة تُرفض");
  for (const p of ["cash", "bank", "wallet", "credit"]) {
    const r = parse("50", "USD", p);
    ok(r.ok && r.money.paid_from === p, `جهة الدفع ${p} تُقبل`);
  }
}

console.log("\nد) الرسائل");
{
  const errs: LedgerEntryInputError[] = ["currency", "amount", "rate", "paid_from"];
  const ar = errs.map((e) => ledgerEntryInputMessage(e, (a) => a));
  const en = errs.map((e) => ledgerEntryInputMessage(e, (_a, b) => b));
  ok(ar.every((m) => m.length > 5) && new Set(ar).size === errs.length, "لكلّ سببٍ رسالةٌ عربيّة مختلفة");
  ok(en.every((m) => /^[\x20-\x7E—]+$/.test(m)) && new Set(en).size === errs.length, "ولكلٍّ رسالةٌ إنجليزيّة");
}

console.log("\nه) «سدّدتُ / قبضتُ»");
{
  for (const p of ["cash", "bank", "wallet"]) ok(isSettleFrom(p), `السداد من ${p} يُقبل`);
  ok(!isSettleFrom("credit"), "والسداد «آجلاً» لا يُقبل");
  ok(!isSettleFrom(""), "ولا الفراغ");
  ok(!isSettleFrom("cheque"), "ولا جهةٌ مجهولة");
  const none = parseSettleRate("  ");
  ok(none.ok && none.rate === null, "بلا سعر: تأخذ القاعدة آخر سعرٍ منشور");
  const typed = parseSettleRate("2,450.5");
  ok(typed.ok && typed.rate === "2450.5", "سعرٌ مكتوب بفاصلة: 2450.5");
  const arabic = parseSettleRate("٣٠٠٠");
  ok(arabic.ok && arabic.rate === "3000", "بأرقامٍ عربيّة: 3000");
  ok(!parseSettleRate("0.5").ok, "سعر دون واحد يُرفض");
  ok(!parseSettleRate("abc").ok, "وغير الرقم");
  ok(!parseSettleRate("1.1234567").ok, "وسبعة كسور");
  ok(!parseSettleRate("1000000000").ok, "وما فوق الحدّ");
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
