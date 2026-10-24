/**
 * قسمة الحصاد بالأعداد الصحيحة: لا يضيع سنتٌ ولا يُخترع، وقواعد كلّ نموذج كما يقولها نصّ العقد؛
 * وعائد المستثمر (MOIC وXIRR) يطابق حساب إكسل (البند ١٨٨).
 *
 *   npx tsx scripts/verify-harvest-split.ts
 */
import { netsAddUp, partiesOf, splitHarvest, type Party, type SplitInput } from "../src/lib/harvestSplit";
import { moic, xirr } from "../src/lib/investorReturns";
import { allocateBig } from "../src/lib/ledger/money";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const B = (n: number) => BigInt(n);
const costs = (owner = 0, investor = 0, manager = 0): Record<Party, bigint> => ({ owner: B(owner), investor: B(investor), manager: B(manager) });
const run = (model: SplitInput["model"], terms: SplitInput["terms"], revenue: number, c = costs(), rent = 0) =>
  splitHarvest({ model, terms, revenue: B(revenue), costs: c, rent: B(rent) });
const need = (r: ReturnType<typeof run>) => {
  if (!r.ok) throw new Error(`expected a split, got ${r.error}`);
  return r;
};

console.log("\nأ) المزارعة والتمويل والمساقاة: المحصول بالنسبة، وكلٌّ يحتفظ بتكلفته");
{
  const r = need(run("sharecrop", { owner_share: 60, investor_share: 40 }, 1_000_000, costs(0, 200_000)));
  ok(r.parties.owner?.received === B(600_000) && r.parties.investor?.received === B(400_000), "١٠٬٠٠٠$ بنسبة ٦٠/٤٠: ٦٬٠٠٠ و٤٬٠٠٠");
  ok(r.parties.investor?.net === B(200_000) && r.parties.owner?.net === B(600_000), "والمستثمر دفع ٢٬٠٠٠ فصافيه ٢٬٠٠٠");
  ok(r.profit === B(800_000) && netsAddUp(r), "ومجموع الصافيَين = الربح ٨٬٠٠٠$");
  ok(r.parties.manager === undefined, "ولا طرفَ ثالث");
  const odd = need(run("sharecrop", { owner_share: 50, investor_share: 50 }, 100_001));
  ok(odd.parties.owner?.received === B(50_001) && odd.parties.investor?.received === B(50_000), "١٬٠٠٠٫٠١$ نصفين: السنت الزائد للأوّل ولا يضيع");
  const third = need(run("finance", { owner_share: 33.33, investor_share: 66.67 }, 1_000_000));
  ok(third.parties.owner?.received === B(333_300) && third.parties.investor?.received === B(666_700), "نسبةٌ بكسرٍ عشريّ ٣٣٫٣٣/٦٦٫٦٧ تُقسم بالضبط");
  const study = need(run("finance", { owner_share: 50, investor_share: 50 }, 1_200_000, costs(100_000, 300_000)));
  ok(study.parties.owner?.net === B(500_000) && study.parties.investor?.net === B(300_000), "مثال الدراسة: ١٢٬٠٠٠$ نصفين، وتمويل ٣٬٠٠٠ وعمالة ١٬٠٠٠: المزارع ٥٬٠٠٠ والمستثمر ٣٬٠٠٠");
  const m = need(run("musaqah", { owner_share: 70, investor_share: 30 }, 500_000));
  ok(m.parties.owner?.received === B(350_000) && m.parties.investor?.received === B(150_000), "والمساقاة: ٣٥٠٠ و١٥٠٠");
  const loss = need(run("sharecrop", { owner_share: 50, investor_share: 50 }, 100_000, costs(0, 300_000)));
  ok(loss.parties.investor?.net === B(-250_000) && loss.parties.owner?.net === B(50_000), "ومحصولٌ أقلّ من المدخلات: يتحمّل المستثمر الزيادة ولا يُطالَب المالك");
  ok(loss.profit === B(-200_000) && netsAddUp(loss), "والمجموع = الخسارة");
}

console.log("\nب) الإيجار: المحصول للمستثمر والأجرة للمالك مهما كان الحصاد");
{
  const r = need(run("lease", {}, 500_000, costs(0, 50_000), 200_000));
  ok(r.parties.owner?.net === B(200_000), "المالك يأخذ الأجرة ٢٬٠٠٠$");
  ok(r.parties.investor?.received === B(500_000) && r.parties.investor?.paid === B(250_000) && r.parties.investor?.net === B(250_000), "والمستثمر يأخذ المحصول ويدفع الأجرة وتكلفته");
  ok(r.profit === B(450_000) && netsAddUp(r), "والمجموع = الربح");
  const none = need(run("lease", {}, 0, costs(), 200_000));
  ok(none.parties.owner?.net === B(200_000) && none.parties.investor?.net === B(-200_000), "ولا حصاد: الأجرة تبقى للمالك والخسارة على المستثمر");
}

console.log("\nج) الثلاثيّة: التكاليف أوّلاً لمن دفعها، ثمّ حصّة الشركة من الربح، والباقي بين الطرفين");
{
  const r = need(run("managed", { owner_share: 40, investor_share: 60, manager_share: 10 }, 1_200_000, costs(100_000, 300_000, 50_000)));
  ok(r.profit === B(750_000), "الربح = ١٢٬٠٠٠ − ٤٬٥٠٠ = ٧٬٥٠٠$");
  ok(r.parties.manager?.net === B(75_000), "الشركة ١٠٪ من الربح: ٧٥٠$");
  ok(r.parties.owner?.net === B(270_000) && r.parties.investor?.net === B(405_000), "والباقي ٦٬٧٥٠ بين المالك ٤٠٪ والمستثمر ٦٠٪");
  ok(r.parties.investor?.received === B(705_000) && r.parties.owner?.received === B(370_000), "وكلٌّ استردّ تكلفته أوّلاً");
  ok(netsAddUp(r), "ومجموع الصافيّات = الربح");
  const flat = need(run("managed", { owner_share: 50, investor_share: 50, manager_share: 20 }, 450_000, costs(0, 450_000, 0)));
  ok(flat.parties.manager?.net === B(0) && flat.parties.owner?.net === B(0) && flat.parties.investor?.net === B(0), "ربحٌ صفر: لا شيء للشركة ولا لغيرها");
  ok(flat.notes.includes("no_manager_share"), "ويقول إنّ الشركة لا تأخذ شيئاً");
  const bad = need(run("managed", { owner_share: 50, investor_share: 50, manager_share: 20 }, 300_000, costs(0, 400_000, 200_000)));
  ok(bad.parties.investor?.received === B(200_000) && bad.parties.manager?.received === B(100_000), "والبيع لا يغطّي التكاليف: يُوزَّع بنسبة ما دفع كلٌّ (٤٠٠ و٢٠٠ من ٣٠٠٠$)");
  ok(bad.parties.manager?.net === B(-100_000) && bad.parties.investor?.net === B(-200_000) && netsAddUp(bad), "فالخسارة على من دفع، ومجموعها خسارة الموسم");
  ok(bad.notes.includes("loss_costs_pro_rata"), "ويقول ذلك");
}

console.log("\nد) ما يُرفض");
{
  const e = (r: ReturnType<typeof run>) => (r.ok ? "ok" : r.error);
  ok(e(run("sharecrop", { owner_share: 60, investor_share: 30 }, 1000)) === "shares", "نسبتان لا تجمعان ١٠٠ تُرفضان");
  ok(e(run("sharecrop", { owner_share: 0, investor_share: 100 }, 1000)) === "shares", "ونسبةٌ دون ١٪");
  ok(e(run("sharecrop", {}, 1000)) === "shares", "ونسبٌ غائبة");
  ok(e(run("managed", { owner_share: 50, investor_share: 50 }, 1000)) === "manager_share", "وحصّة شركةٍ غائبة");
  ok(e(run("managed", { owner_share: 50, investor_share: 50, manager_share: 51 }, 1000)) === "manager_share", "وفوق ٥٠٪");
  ok(e(run("managed", { owner_share: 50, investor_share: 50, manager_share: 0 }, 1000)) === "manager_share", "ودون ١٪");
  ok(e(run("sharecrop", { owner_share: 50, investor_share: 50 }, -1)) === "negative", "وإيرادٌ سالب");
  ok(e(run("sharecrop", { owner_share: 50, investor_share: 50 }, 1000, costs(-1))) === "negative", "وتكلفةٌ سالبة");
  ok(e(splitHarvest({ model: "other" as never, terms: {}, revenue: B(1), costs: costs(), rent: B(0) })) === "model", "ونموذجٌ مجهول");
  ok(partiesOf("managed").length === 3 && partiesOf("lease").length === 2, "الأطراف: ثلاثة في الثلاثيّة واثنان في غيرها");
}

console.log("\nه) ألف حالةٍ عشوائيّة: لا يضيع سنت");
{
  let seed = 20261024;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  let bad = 0;
  let mismatched = 0;
  const models: SplitInput["model"][] = ["sharecrop", "finance", "musaqah", "lease", "managed"];
  for (let i = 0; i < 1000; i++) {
    const model = models[rnd(models.length)];
    const os = 1 + rnd(99);
    const ms = 1 + rnd(50);
    const revenue = rnd(5_000_000);
    const c = costs(rnd(500_000), rnd(500_000), model === "managed" ? rnd(300_000) : 0);
    const r = run(model, { owner_share: os, investor_share: 100 - os, manager_share: ms }, revenue, c, rnd(400_000));
    if (!r.ok) {
      bad++;
      continue;
    }
    if (!netsAddUp(r)) mismatched++;
    const received = Object.values(r.parties).reduce((a, p) => a + p.received, BigInt(0));
    const expect = model === "lease" ? B(revenue) + B(Number(r.parties.owner?.received ?? 0)) : B(revenue);
    if (received !== expect) mismatched++;
    if (model === "managed" && r.profit > BigInt(0) && (r.parties.manager?.net ?? BigInt(-1)) < BigInt(0)) mismatched++;
  }
  ok(bad === 0, "كلّها صحيحة المدخلات فلا يُرفض منها شيء");
  ok(mismatched === 0, "ومجموع الصافيّات = الربح دائماً، ومجموع المقبوض = الإيراد (والأجرة في الإيجار)");
}

console.log("\nو) القسمة بأوزانٍ أعدادٍ صحيحة");
{
  const a = allocateBig(B(100), [B(1), B(1), B(1)]);
  ok(a.join(",") === "34,33,33" && a.reduce((x, y) => x + y, BigInt(0)) === B(100), "١٠٠ على ثلاثة: ٣٤ و٣٣ و٣٣");
  const huge = allocateBig(B(10) ** B(15), [B(10) ** B(15) + B(1), B(10) ** B(15) - B(1)]);
  ok(huge[0] + huge[1] === B(10) ** B(15), "وبأوزانٍ ضخمة (١٠¹⁵) لا يضيع شيءٌ لأنّ لا عائم في الحساب");
  let threw = false;
  try {
    allocateBig(B(1), [B(0), B(0)]);
  } catch {
    threw = true;
  }
  ok(threw, "وأوزانٌ كلّها صفر تُرفض");
}

console.log("\nز) عائد المستثمر");
{
  const excel = xirr([
    { date: "2008-01-01", amount: -10000 },
    { date: "2008-03-01", amount: 2750 },
    { date: "2008-10-30", amount: 4250 },
    { date: "2009-02-15", amount: 3250 },
    { date: "2009-04-01", amount: 2750 },
  ]);
  ok(excel !== null && Math.abs(excel - 0.373362535) < 1e-7, `مثال إكسل الرسميّ: XIRR = 0.373362535 (جاء ${excel?.toFixed(9)})`);
  const dbl = xirr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: 200 }]);
  ok(dbl !== null && Math.abs(dbl - 1) < 1e-9, "ضعف رأس المال بعد سنة: ١٠٠٪");
  const short = xirr([{ date: "2026-01-01", amount: -100 }, { date: "2026-03-14", amount: 110 }]);
  ok(short !== null && Math.abs(short - (Math.pow(1.1, 365 / 72) - 1)) < 1e-9, "١٠٪ في ٧٢ يوماً: سنويّاً أكثر بكثير");
  const half = xirr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: 50 }]);
  ok(half !== null && Math.abs(half + 0.5) < 1e-9, "نصف رأس المال بعد سنة: −٥٠٪");
  ok(xirr([{ date: "2026-01-01", amount: 100 }, { date: "2026-06-01", amount: 50 }]) === null, "تدفّقات كلّها داخلة: لا معدّل");
  ok(xirr([{ date: "2026-01-01", amount: -100 }]) === null, "وتدفّقٌ واحد: لا معدّل");
  ok(xirr([{ date: "2026-01-01", amount: -100 }, { date: "bad", amount: 120 }]) === null, "وتاريخٌ فاسد: لا معدّل");
  const rev = xirr([{ date: "2026-06-01", amount: 150 }, { date: "2026-01-01", amount: -100 }]);
  ok(rev !== null && rev > 0, "والترتيب لا يهمّ");
  ok(moic([{ date: "2026-01-01", amount: -3000 }, { date: "2026-09-01", amount: 6000 }]) === 2, "MOIC: ٦٬٠٠٠ على ٣٬٠٠٠ = ٢");
  ok(moic([{ date: "2026-01-01", amount: -100 }, { date: "2026-02-01", amount: -100 }, { date: "2026-09-01", amount: 100 }]) === 0.5, "ومن دفعتين: ١٠٠ على ٢٠٠ = ٠٫٥");
  ok(moic([{ date: "2026-01-01", amount: 100 }]) === null, "وبلا توظيف: لا مضاعف");
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
