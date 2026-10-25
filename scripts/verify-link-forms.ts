/**
 * ما يكتبه الشريك في نموذج الاقتراح يُقرأ بلا تقريب ويُرفض بسببه، وكشف حساب المستثمر يُحسب من القيود
 * المؤكَّدة وحدها بتواريخ حركة المال (البند ١٨٨ ج).
 *
 *   npx tsx scripts/verify-link-forms.ts
 */
import {
  attachReversals,
  counterNeedsAccount,
  investorStatement,
  isLive,
  isReversed,
  parseReversalReason,
  reversalAction,
  type ReversalRow,
  linkProposalMessage,
  linkUsd,
  outstandingFinancing,
  parseLinkProposal,
  proposerNeedsAccount,
  safeReturnTo,
  type LinkProposalError,
  type LinkRow,
  type RawLinkProposal,
} from "../src/lib/ledgerLinks";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const S1 = "51000000-0000-0000-0000-000000000001";
const S2 = "52000000-0000-0000-0000-000000000002";

const raw = (over: Partial<RawLinkProposal> = {}): RawLinkProposal => ({
  kind: "input_finance", amount: "3000", currency: "USD", date: "2026-03-01", account: "bank", principal: "", season: S1, rate: "", memo: "", ...over,
});
const bad = (r: ReturnType<typeof parseLinkProposal>, why: LinkProposalError) => !r.ok && r.error === why;

console.log("\nأ) الاقتراح");
{
  const r = parseLinkProposal(raw());
  ok(r.ok && r.args.amountMinor === 300000 && r.args.account === "bank" && r.args.season === S1 && r.args.principalMinor === 0 && r.args.rate === null, "تمويل ٣٬٠٠٠$ من البنك للموسم");
  ok(bad(parseLinkProposal(raw({ account: "" })), "account"), "بلا جهة دفع يُرفض");
  ok(bad(parseLinkProposal(raw({ account: "credit" })), "account"), "و«آجل» ليست جهة");
  ok(bad(parseLinkProposal(raw({ season: "" })), "season"), "التمويل بلا موسم يُرفض");
  ok(bad(parseLinkProposal(raw({ season: "1; drop table" })), "season"), "ومعرّفٌ ليس uuid");
  ok(bad(parseLinkProposal(raw({ amount: "0" })), "amount"), "ومبلغ صفر");
  ok(bad(parseLinkProposal(raw({ amount: "12.345" })), "amount"), "وثلاثة كسور لا تُقرَّب");
  ok(bad(parseLinkProposal(raw({ kind: "gift" })), "kind"), "ونوعٌ مجهول");
  ok(bad(parseLinkProposal(raw({ currency: "EUR" })), "currency"), "وعملةٌ مجهولة");
  ok(bad(parseLinkProposal(raw({ date: "2026-02-31" })), "date"), "وتاريخٌ غير حقيقيّ");
  const hs = parseLinkProposal(raw({ kind: "harvest_share", amount: "1,000", principal: "3000", account: "" }));
  ok(hs.ok && hs.args.amountMinor === 100000 && hs.args.principalMinor === 300000 && hs.args.account === null, "نصيب الحصاد أقلّ من التمويل (موسمٌ خاسر) مقبول، بلا جهة دفع");
  ok(bad(parseLinkProposal(raw({ kind: "harvest_share", principal: "abc", account: "" })), "principal"), "وأصلٌ غير رقم يُرفض");
  const ig = parseLinkProposal(raw({ kind: "input_finance", principal: "500" }));
  ok(ig.ok && ig.args.principalMinor === 0, "والأصل لا يُقرأ في غير نصيب الحصاد");
  const po = parseLinkProposal(raw({ kind: "payout", season: "", account: "cash" }));
  ok(po.ok && po.args.season === null, "والتسليم بلا موسم مقبول");
  const sdg = parseLinkProposal(raw({ currency: "SDG", amount: "2,450,500", rate: "3,000" }));
  ok(sdg.ok && sdg.args.amountMinor === 245050000 && sdg.args.rate === 3000, "بالجنيه بسعرٍ مكتوب");
  ok(bad(parseLinkProposal(raw({ currency: "SDG", rate: "0.5" })), "rate"), "وسعرٌ دون واحد يُرفض");
  const sdg2 = parseLinkProposal(raw({ currency: "SDG", amount: "100" }));
  ok(sdg2.ok && sdg2.args.rate === null, "وبلا سعر: تأخذ القاعدة المنشور");
  const long = parseLinkProposal(raw({ memo: "x".repeat(500) }));
  ok(long.ok && long.args.memo.length === 200, "والملاحظة تُقصّ إلى ٢٠٠ حرف");
  ok(proposerNeedsAccount("input_finance") && proposerNeedsAccount("payout") && proposerNeedsAccount("rent_payment") && !proposerNeedsAccount("harvest_share"), "من يدفع يختار جهته");
  ok(counterNeedsAccount("payout") && counterNeedsAccount("rent_payment") && !counterNeedsAccount("input_finance") && !counterNeedsAccount("harvest_share"), "ومن يستلم يختار جهته");
  const errs: LinkProposalError[] = ["kind", "currency", "amount", "principal", "date", "account", "season", "rate"];
  const ar = errs.map((e) => linkProposalMessage(e, (a) => a));
  const en = errs.map((e) => linkProposalMessage(e, (_a, b) => b));
  ok(new Set(ar).size === errs.length && new Set(en).size === errs.length, "ولكلّ سببٍ رسالةٌ بالعربيّة والإنجليزيّة");
}

const row = (over: Partial<LinkRow>): LinkRow => ({
  id: Math.random().toString(36).slice(2), kind: "input_finance", status: "confirmed", mine: true, other_name: "فاطمة", agreement_id: "a", agreement_ref: "SA-1",
  season_id: S1, amount_minor: 300000, principal_minor: 0, currency: "USD", fx_rate: null, entry_date: "2026-03-01", memo: "", reject_reason: null,
  created_at: "2026-03-01T00:00:00Z", resolved_at: "2026-03-01T00:00:00Z", ...over,
});

console.log("\nب) كشف حساب المستثمر");
{
  const rows: LinkRow[] = [
    row({ kind: "input_finance", amount_minor: 300000, entry_date: "2026-03-01" }),
    row({ kind: "harvest_share", amount_minor: 600000, principal_minor: 300000, entry_date: "2026-09-01" }),
    row({ kind: "payout", amount_minor: 600000, entry_date: "2026-10-01" }),
    row({ kind: "input_finance", amount_minor: 999900, status: "pending" }),
    row({ kind: "payout", amount_minor: 999900, status: "rejected" }),
  ];
  const st = investorStatement(rows);
  ok(st.invested === BigInt(300000), "الموظَّف ٣٬٠٠٠$ (المعلّق لا يُحتسب)");
  ok(st.recognised === BigInt(600000) && st.handedOver === BigInt(600000) && st.due === BigInt(0), "المقرّ به ٦٬٠٠٠$ وسُلّم ٦٬٠٠٠$ وصفرٌ باقٍ (والمرفوض لا يُحتسب)");
  ok(st.settled, "فالحساب مُصفّى");
  ok(st.moicCash === 2 && st.moicRecognised === 2, "ضعف رأس المال");
  const expected = Math.pow(2, 365 / 214) - 1;
  ok(st.xirr !== null && Math.abs(st.xirr - expected) < 1e-9, `والعائد السنويّ من تاريخَي الحركة (${expected.toFixed(4)})`);
  ok(st.flows.length === 2 && st.flows[0].amount === -3000 && st.flows[1].amount === 6000, "وتدفّقان: −٣٬٠٠٠ و+٦٬٠٠٠");

  const partial = investorStatement([
    row({ kind: "input_finance", amount_minor: 300000 }),
    row({ kind: "harvest_share", amount_minor: 600000, principal_minor: 300000 }),
    row({ kind: "payout", amount_minor: 200000, entry_date: "2026-10-01" }),
  ]);
  ok(partial.due === BigInt(400000) && !partial.settled, "وتسليمٌ جزئيّ: يبقى ٤٬٠٠٠$ مستحقّة");
  ok(partial.moicCash !== null && Math.abs(partial.moicCash - 2 / 3) < 1e-9 && partial.moicRecognised === 2, "المضاعف المقبوض ٠٫٦٧ والمقرّ به ٢");
  ok(partial.xirr !== null && partial.xirr < 0, "والعائد المقبوض سالبٌ ما لم يُسلَّم الباقي");

  const none = investorStatement([]);
  ok(none.invested === BigInt(0) && none.moicCash === null && none.xirr === null && none.settled, "وبلا قيود: لا مضاعف ولا عائد");

  const sdg = row({ kind: "input_finance", currency: "SDG", amount_minor: 245050000, fx_rate: "2450.500000" });
  ok(linkUsd(sdg) === BigInt(100000), "٢٬٤٥٠٬٥٠٠ جنيهاً بسعر ٢٤٥٠٫٥ = ١٬٠٠٠$");
  ok(linkUsd(row({ currency: "SDG", amount_minor: 100, fx_rate: null })) === BigInt(0), "وجنيهٌ بلا سعر لا يُحتسب بدولار");
  const lease = investorStatement([row({ kind: "rent_payment", amount_minor: 500000, season_id: null })]);
  ok(lease.rent === BigInt(500000) && lease.invested === BigInt(0) && lease.flows.length === 1, "والأجرة تُحسب أجرةً لا توظيفاً");
}

console.log("\nج) ما بقي من التمويل لكلّ موسم");
{
  const rows: LinkRow[] = [
    row({ kind: "input_finance", amount_minor: 300000, season_id: S1 }),
    row({ kind: "input_finance", amount_minor: 245050000, currency: "SDG", fx_rate: 2450.5, season_id: S1 }),
    row({ kind: "input_finance", amount_minor: 100000, season_id: S2 }),
    row({ kind: "harvest_share", amount_minor: 600000, principal_minor: 300000, season_id: S1 }),
    row({ kind: "input_finance", amount_minor: 777700, season_id: S1, status: "pending" }),
  ];
  const a = outstandingFinancing(rows, S1);
  ok(a.USD === BigInt(0) && a.SDG === BigInt(245050000), "الموسم الأوّل: الدولار أُطفئ والجنيه باقٍ");
  ok(outstandingFinancing(rows, S2).USD === BigInt(100000), "والثاني ١٠٠٠$ باقية");
  ok(outstandingFinancing(rows, "x").USD === BigInt(0), "وموسمٌ لا قيد له صفر");
  const over = outstandingFinancing([row({ kind: "input_finance", amount_minor: 100 }), row({ kind: "harvest_share", amount_minor: 500, principal_minor: 900 })], S1);
  ok(over.USD === BigInt(0), "وما زاد على الأصل لا يصير سالباً");
}

console.log("\nد) إلى أين يعود النموذج");
{
  const id = "aa000000-0000-0000-0000-000000000001";
  ok(safeReturnTo("/books?r=links") === "/books?r=links", "صفحة الاقتراحات");
  ok(safeReturnTo("/books") === "/books", "وصفحة الدفاتر");
  ok(safeReturnTo(`/invest/agreements/${id}`) === `/invest/agreements/${id}`, "وصفحة العقد");
  ok(safeReturnTo("https://evil.example/x") === "/books?r=links", "وعنوانٌ خارجيّ يعود إلى الاقتراحات");
  ok(safeReturnTo("//evil.example") === "/books?r=links", "وعنوانٌ بلا مخطّط");
  ok(safeReturnTo("/books?r=links&x=<script>") === "/books?r=links", "وما فيه رموزٌ غريبة");
  ok(safeReturnTo("/admin/users") === "/books?r=links", "وصفحةٌ أخرى من الموقع");
  ok(safeReturnTo(`/invest/agreements/${id}/../../admin`) === "/books?r=links", "والتفافٌ بالنقطتين");
  ok(safeReturnTo("") === "/books?r=links", "والفراغ");
}

console.log("\nهـ) الإلغاء باتّفاق الطرفين لا يُحتسب بعد قبوله");
{
  const rev = (over: Partial<ReversalRow> & { link_id: string }): ReversalRow => ({
    id: "r-" + over.link_id + "-" + (over.status ?? "pending"), mine: true, status: "pending", reason: "كُتب المبلغ خطأً",
    reject_reason: null, created_at: "2026-10-01T10:00:00Z", resolved_at: null, ...over,
  });
  const fin = row({ id: "L-fin", kind: "input_finance", amount_minor: 300000, season_id: S1, entry_date: "2026-03-01" });
  const share = row({ id: "L-share", kind: "harvest_share", amount_minor: 600000, principal_minor: 300000, season_id: S1, entry_date: "2026-09-01" });
  const payout = row({ id: "L-pay", kind: "payout", amount_minor: 200000, entry_date: "2026-10-01" });
  const links = [fin, share, payout];

  // The same request seen from the two sides, and the best one chosen per entry.
  const withR = attachReversals(links, [
    rev({ link_id: "L-fin", status: "rejected", reject_reason: "تسلّمته", created_at: "2026-09-01T10:00:00Z" }),
    rev({ link_id: "L-fin", status: "pending", created_at: "2026-09-02T10:00:00Z" }),
    rev({ link_id: "L-pay", status: "withdrawn" }),
    rev({ link_id: "L-pay", status: "rejected", created_at: "2026-10-05T10:00:00Z", reject_reason: "لا" }),
  ]);
  ok(withR[0].reversal?.status === "pending", "لقيدٍ طلبٌ مرفوض ثمّ معلّق: يُختار المعلّق");
  ok(withR[1].reversal === null, "وقيدٌ بلا طلب: لا شيء");
  ok(withR[2].reversal?.status === "rejected", "وبين مسحوبٍ ومرفوضٍ: الأحدث");
  const acc = attachReversals(links, [rev({ link_id: "L-share", status: "accepted", resolved_at: "2026-10-02T10:00:00Z" }), rev({ link_id: "L-share", status: "rejected", reject_reason: "x", created_at: "2026-12-01T10:00:00Z" })]);
  ok(acc[1].reversal?.status === "accepted", "والمقبول يغلب ولو جاء بعده مرفوض");
  ok(isReversed(acc[1]) && !isReversed(acc[0]) && !isLive(acc[1]) && isLive(acc[0]), "المقبول مُلغى، وغيره حيّ");
  ok(!isLive(row({ status: "pending" })) && !isLive(row({ status: "rejected" })), "والمعلّق والمرفوض ليسا حيَّين");

  const before = investorStatement(links);
  ok(before.invested === BigInt(300000) && before.recognised === BigInt(600000) && before.handedOver === BigInt(200000), "قبل الإلغاء: وظّف ٣٬٠٠٠ وأُقرّ ٦٬٠٠٠ وسُلّم ٢٬٠٠٠");
  const cancelledPayout = investorStatement(attachReversals(links, [rev({ link_id: "L-pay", status: "accepted" })]));
  ok(cancelledPayout.handedOver === BigInt(0) && cancelledPayout.due === BigInt(600000) && cancelledPayout.flows.length === 1, "إلغاء التسليم: يعود المستحقّ كاملاً ويسقط تدفّقه");
  const cancelledFin = investorStatement(attachReversals(links, [rev({ link_id: "L-fin", status: "accepted" })]));
  ok(cancelledFin.invested === BigInt(0) && cancelledFin.moicCash === null, "إلغاء التمويل: لا توظيف، ولا مضاعف");
  const pendingOnly = investorStatement(attachReversals(links, [rev({ link_id: "L-pay", status: "pending" })]));
  ok(pendingOnly.handedOver === BigInt(200000), "وطلبٌ معلّق لا يغيّر الكشف حتى يُقبل");

  const out = outstandingFinancing(attachReversals(links, [rev({ link_id: "L-share", status: "accepted" })]), S1);
  ok(out.USD === BigInt(300000), "إلغاء نصيب الحصاد يُرجع التمويل المستحقّ (٣٬٠٠٠$)");
  ok(outstandingFinancing(attachReversals(links, [rev({ link_id: "L-fin", status: "accepted" })]), S1).USD === BigInt(0), "وإلغاء التمويل يُسقطه (ولا يصير سالباً)");

  // What the reader may do.
  ok(reversalAction(row({ status: "pending" })) === "none", "المعلّق يُلغى بالإلغاء العاديّ لا بهذا");
  ok(reversalAction(row({ status: "confirmed" })) === "request", "المؤكَّد بلا طلب: يطلب");
  ok(reversalAction(row({ status: "confirmed", reversal: rev({ link_id: "x", status: "pending", mine: true }) })) === "withdraw", "وطلبي المعلّق: أسحبه");
  ok(reversalAction(row({ status: "confirmed", reversal: rev({ link_id: "x", status: "pending", mine: false }) })) === "answer", "وطلب شريكي المعلّق: أردّ عليه");
  ok(reversalAction(row({ status: "confirmed", reversal: rev({ link_id: "x", status: "accepted" }) })) === "none", "والمقبول: انتهى");
  ok(reversalAction(row({ status: "confirmed", reversal: rev({ link_id: "x", status: "rejected", reject_reason: "ل" }) })) === "request", "والمرفوض: يجوز أن يطلب ثانية");
  ok(reversalAction(row({ status: "confirmed", reversal: rev({ link_id: "x", status: "withdrawn" }) })) === "request", "والمسحوب كذلك");

  ok(parseReversalReason("  كُتب خطأً  ") === "كُتب خطأً", "السبب يُقصّ");
  ok(parseReversalReason("ab") === null && parseReversalReason("   ") === null && parseReversalReason("") === null, "والقصير والفارغ يُرفضان");
  ok(parseReversalReason("س".repeat(300)) !== null && parseReversalReason("س".repeat(301)) === null, "والحدّ ٣٠٠ حرف");
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
