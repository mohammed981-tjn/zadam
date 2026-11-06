import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import type { AgreementView } from "@/lib/agreements";
import { netsAddUp, partiesOf, splitHarvest, type Party, type SplitNote } from "@/lib/harvestSplit";
import { formatMoney, parseAmount } from "@/lib/ledger/money";
import { readJson, text } from "@/lib/appRoute";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «كيف يُقسم الحصاد؟» في التطبيق (البند ٢٠٣): the website's harvest-split calculator, worked out here with the
 * website's own `splitHarvest` (whole cents, never a lost or invented one) and the shares read from the agreement's
 * stored terms — never from the request. It records nothing and promises nothing; amounts are in US dollars, like
 * the ledger.
 */
const NOTE = (locale: Locale): Record<SplitNote, string> => ({
  costs_repaid_first: tr(locale, "التكاليف الموثّقة تُستردّ أوّلاً لمن دفعها، ثمّ يُقسم الربح.", "The documented costs are repaid first, to whoever paid them; then the profit is split."),
  loss_costs_pro_rata: tr(locale, "البيع لا يغطّي التكاليف: يُوزَّع على من دفعها بنسبة ما دفع، والخسارة عليهم.", "The sale does not cover the costs: it is shared among those who paid them in proportion, and they bear the loss."),
  no_manager_share: tr(locale, "لا ربح، فلا شيء للشركة المديرة من الربح.", "There is no profit, so the managing company takes nothing from it."),
  lease_rent_fixed: tr(locale, "الأجرة للمالك مهما كان الحصاد، والمحصول كلّه للمستثمر.", "The rent is the owner's whatever the harvest, and the whole crop is the investor's."),
  costs_stay_with_payer: tr(locale, "المحصول يُقسم بالنسبة، وكلُّ طرفٍ يتحمّل ما دفعه من تكاليف.", "The crop is split by proportion, and each party bears the costs it paid."),
});
const PARTY = (locale: Locale): Record<Party, string> => ({ owner: tr(locale, "صاحب الأرض", "Landowner"), investor: tr(locale, "المستثمر", "Investor"), manager: tr(locale, "الشركة المديرة", "Managing company") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: tr(locale, "طلبٌ غير مفهوم.", "The request was not understood.") }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("partnership_agreement_view", { p_agreement: id });
  if (error || !data) return NextResponse.json({ error: tr(locale, "لم نجد هذا العقد.", "We could not find this contract.") }, { status: 404 });
  const a = data as AgreementView;

  const usd = (k: string): bigint | null => {
    const raw = text(body, k, 30);
    return raw === "" ? BigInt(0) : parseAmount(raw, "USD");
  };
  const revenue = usd("revenue");
  const costs = { owner: usd("cost_owner"), investor: usd("cost_investor"), manager: usd("cost_manager") };
  const rent = usd("rent");
  if (revenue === null || costs.owner === null || costs.investor === null || costs.manager === null || rent === null) {
    return NextResponse.json({ error: tr(locale, "اكتب أرقاماً صحيحة بأقصى كسرين عشريين.", "Enter valid numbers with at most two decimals.") }, { status: 400 });
  }
  const r = splitHarvest({
    model: a.model,
    terms: { owner_share: a.terms.owner_share, investor_share: a.terms.investor_share, manager_share: a.terms.manager_share },
    revenue,
    costs: { owner: costs.owner, investor: costs.investor, manager: a.model === "managed" ? costs.manager : BigInt(0) },
    rent: a.model === "lease" ? rent : BigInt(0),
  });
  if (!r.ok) {
    return NextResponse.json(
      {
        error:
          r.error === "shares" || r.error === "manager_share"
            ? tr(locale, "نسب العقد غير مكتملة، فلا تُحسب القسمة بعد.", "The agreement's shares are not complete yet, so no split can be worked out.")
            : tr(locale, "لا يمكن حساب القسمة بهذه المدخلات.", "The split cannot be worked out from these inputs."),
      },
      { status: 400 },
    );
  }
  const money = (v: bigint) => formatMoney(v, "USD", false);
  return NextResponse.json({
    parties: partiesOf(a.model)
      .filter((p) => r.parties[p])
      .map((p) => ({
        party: p,
        label: PARTY(locale)[p],
        received: money(r.parties[p]!.received),
        paid: money(r.parties[p]!.paid),
        net: money(r.parties[p]!.net),
      })),
    profit_label: r.profit >= BigInt(0) ? tr(locale, "ربح الموسم", "Season profit") : tr(locale, "خسارة الموسم", "Season loss"),
    profit: money(r.profit),
    notes: r.notes.map((n) => NOTE(locale)[n]),
    adds_up: netsAddUp(r),
  });
}
