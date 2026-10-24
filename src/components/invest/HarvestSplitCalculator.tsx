"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { partiesOf, splitHarvest, netsAddUp, type Party, type SplitNote } from "@/lib/harvestSplit";
import type { InvestorModel } from "@/lib/investors";
import { formatMoney, parseAmount } from "@/lib/ledger/money";
import { field, label } from "@/lib/ui";

/**
 * حاسبة قسمة الحصاد (البند ١٨٨): يكتب الطرفان ما يتوقّعانه أو ما حدث، فيريان من يأخذ ماذا بحسب نصّ عقدهما.
 *
 * It reads the shares from the agreement's own terms and applies the rule of the agreement's model; it
 * records nothing and promises nothing. Amounts are in US dollars, like the ledger. The arithmetic is
 * `splitHarvest` — whole cents, never a lost or invented one.
 */
export default function HarvestSplitCalculator({
  model,
  ownerShare,
  investorShare,
  managerShare,
  rentHint,
  names,
}: {
  model: InvestorModel;
  ownerShare?: number;
  investorShare?: number;
  managerShare?: number;
  /** The rent as the agreement states it ("200,000 جنيه"), shown as a hint: the calculator takes dollars. */
  rentHint?: string;
  names: Record<Party, string>;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const parties = partiesOf(model);

  const [revenue, setRevenue] = useState("");
  const [costs, setCosts] = useState<Record<Party, string>>({ owner: "", investor: "", manager: "" });
  const [rent, setRent] = useState("");

  const usd = (raw: string): bigint | null => (raw.trim() === "" ? BigInt(0) : parseAmount(raw, "USD"));

  const calc = useMemo(() => {
    const rev = usd(revenue);
    const c = { owner: usd(costs.owner), investor: usd(costs.investor), manager: usd(costs.manager) };
    const rt = usd(rent);
    if (rev === null || c.owner === null || c.investor === null || c.manager === null || rt === null) return { error: "input" as const };
    const r = splitHarvest({
      model,
      terms: { owner_share: ownerShare, investor_share: investorShare, manager_share: managerShare },
      revenue: rev,
      costs: { owner: c.owner, investor: c.investor, manager: model === "managed" ? c.manager : BigInt(0) },
      rent: model === "lease" ? rt : BigInt(0),
    });
    return r.ok ? { result: r } : { error: r.error };
  }, [revenue, costs, rent, model, ownerShare, investorShare, managerShare]);

  const money = (v: bigint) => formatMoney(v, "USD", false);
  const noteText = (n: SplitNote): string =>
    ({
      costs_repaid_first: t("التكاليف الموثّقة تُستردّ أوّلاً لمن دفعها، ثمّ يُقسم الربح.", "The documented costs are repaid first, to whoever paid them; then the profit is split."),
      loss_costs_pro_rata: t("البيع لا يغطّي التكاليف: يُوزَّع على من دفعها بنسبة ما دفع، والخسارة عليهم.", "The sale does not cover the costs: it is shared among those who paid them in proportion, and they bear the loss."),
      no_manager_share: t("لا ربح، فلا شيء للشركة المديرة من الربح.", "There is no profit, so the managing company takes nothing from it."),
      lease_rent_fixed: t("الأجرة للمالك مهما كان الحصاد، والمحصول كلّه للمستثمر.", "The rent is the owner's whatever the harvest, and the whole crop is the investor's."),
      costs_stay_with_payer: t("المحصول يُقسم بالنسبة، وكلُّ طرفٍ يتحمّل ما دفعه من تكاليف.", "The crop is split by proportion, and each party bears the costs it paid."),
    })[n];

  const partyName = (p: Party) => (p === "owner" ? t("صاحب الأرض", "Landowner") : p === "investor" ? t("المستثمر", "Investor") : t("الشركة المديرة", "Managing company"));
  const errorText =
    "error" in calc
      ? calc.error === "input"
        ? t("اكتب أرقاماً صحيحة بأقصى كسرين عشريين.", "Enter valid numbers with at most two decimals.")
        : calc.error === "shares" || calc.error === "manager_share"
          ? t("نسب العقد غير مكتملة، فلا تُحسب القسمة بعد.", "The agreement's shares are not complete yet, so no split can be worked out.")
          : t("لا يمكن حساب القسمة بهذه المدخلات.", "The split cannot be worked out from these inputs.")
      : null;

  return (
    <div className="mt-3 text-sm">
      <p className="text-muted">
        {t(
          "اكتب ما تتوقّعه أو ما حدث بالدولار؛ تظهر القسمة بحسب نصّ هذا العقد. حاسبةٌ للتقدير، ولا تضمن المنصّة عائداً.",
          "Enter what you expect, or what happened, in US dollars; the split follows this agreement's text. An estimate only — the platform guarantees no return.",
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>
          {model === "musaqah" ? t("قيمة الثمر المباع ($)", "Value of the fruit sold ($)") : t("ثمن المحصول المباع ($)", "What the crop sold for ($)")}
          <input className={field} inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="12000" />
        </label>
        {model === "lease" && (
          <label className={label}>
            {t("الأجرة بالدولار ($)", "Rent in dollars ($)")}
            <input className={field} inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} />
            {rentHint && <span className="text-xs text-muted">{t(`في العقد: ${rentHint}`, `In the agreement: ${rentHint}`)}</span>}
          </label>
        )}
        {parties.map((p) => (
          <label key={p} className={label}>
            {t(`تكلفة دفعها ${partyName(p)} ($)`, `Costs paid by the ${partyName(p).toLowerCase()} ($)`)}
            <input className={field} inputMode="decimal" value={costs[p]} onChange={(e) => setCosts({ ...costs, [p]: e.target.value })} />
          </label>
        ))}
      </div>

      {errorText && <p className="mt-3 rounded-xl border border-danger/40 px-3 py-2 text-danger" role="alert">{errorText}</p>}

      {"result" in calc && calc.result && (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead className="bg-card text-start">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("الطرف", "Party")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("يستلم", "Receives")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("دفع", "Paid")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("الصافي", "Left with")}</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const r = calc.result.parties[p];
                  if (!r) return null;
                  return (
                    <tr key={p} className="border-t border-border">
                      <td className="px-3 py-2">
                        {partyName(p)}
                        {names[p] && <span className="block text-xs text-muted">{names[p]}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{money(r.received)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(r.paid)}</td>
                      <td className={`px-3 py-2 font-bold tabular-nums ${r.net < BigInt(0) ? "text-danger" : ""}`}>{money(r.net)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-card font-bold">
                  <td className="px-3 py-2" colSpan={3}>{calc.result.profit >= BigInt(0) ? t("ربح الموسم", "Season profit") : t("خسارة الموسم", "Season loss")}</td>
                  <td className="px-3 py-2 tabular-nums">{money(calc.result.profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="mt-2 list-disc ps-5 text-xs text-muted">
            {calc.result.notes.map((n) => (
              <li key={n}>{noteText(n)}</li>
            ))}
          </ul>
          {!netsAddUp(calc.result) && <p className="mt-2 text-danger" role="alert">{t("مجموع الصافيّات لا يساوي الربح — أبلغ الإدارة.", "The nets do not add up to the profit — tell the administrators.")}</p>}
        </div>
      )}
    </div>
  );
}
