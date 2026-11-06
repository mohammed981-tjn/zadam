import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import type { AgreementView } from "@/lib/agreements";
import { netsAddUp, partiesOf, splitHarvest, type Party, type SplitNote } from "@/lib/harvestSplit";
import { formatMoney, parseAmount } from "@/lib/ledger/money";
import { readJson, text } from "@/lib/appRoute";

/**
 * «كيف يُقسم الحصاد؟» في التطبيق (البند ٢٠٣): the website's harvest-split calculator, worked out here with the
 * website's own `splitHarvest` (whole cents, never a lost or invented one) and the shares read from the agreement's
 * stored terms — never from the request. It records nothing and promises nothing; amounts are in US dollars, like
 * the ledger.
 */
const NOTE: Record<SplitNote, string> = {
  costs_repaid_first: "التكاليف الموثّقة تُستردّ أوّلاً لمن دفعها، ثمّ يُقسم الربح.",
  loss_costs_pro_rata: "البيع لا يغطّي التكاليف: يُوزَّع على من دفعها بنسبة ما دفع، والخسارة عليهم.",
  no_manager_share: "لا ربح، فلا شيء للشركة المديرة من الربح.",
  lease_rent_fixed: "الأجرة للمالك مهما كان الحصاد، والمحصول كلّه للمستثمر.",
  costs_stay_with_payer: "المحصول يُقسم بالنسبة، وكلُّ طرفٍ يتحمّل ما دفعه من تكاليف.",
};
const PARTY: Record<Party, string> = { owner: "صاحب الأرض", investor: "المستثمر", manager: "الشركة المديرة" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("partnership_agreement_view", { p_agreement: id });
  if (error || !data) return NextResponse.json({ error: "لم نجد هذا العقد." }, { status: 404 });
  const a = data as AgreementView;

  const usd = (k: string): bigint | null => {
    const raw = text(body, k, 30);
    return raw === "" ? BigInt(0) : parseAmount(raw, "USD");
  };
  const revenue = usd("revenue");
  const costs = { owner: usd("cost_owner"), investor: usd("cost_investor"), manager: usd("cost_manager") };
  const rent = usd("rent");
  if (revenue === null || costs.owner === null || costs.investor === null || costs.manager === null || rent === null) {
    return NextResponse.json({ error: "اكتب أرقاماً صحيحة بأقصى كسرين عشريين." }, { status: 400 });
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
            ? "نسب العقد غير مكتملة، فلا تُحسب القسمة بعد."
            : "لا يمكن حساب القسمة بهذه المدخلات.",
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
        label: PARTY[p],
        received: money(r.parties[p]!.received),
        paid: money(r.parties[p]!.paid),
        net: money(r.parties[p]!.net),
      })),
    profit_label: r.profit >= BigInt(0) ? "ربح الموسم" : "خسارة الموسم",
    profit: money(r.profit),
    notes: r.notes.map((n) => NOTE[n]),
    adds_up: netsAddUp(r),
  });
}
