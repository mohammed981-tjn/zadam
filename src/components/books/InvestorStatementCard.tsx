import { formatMoney } from "@/lib/ledger/money";
import { tr, type Locale } from "@/lib/i18n";
import type { InvestorStatement } from "@/lib/ledgerLinks";

/**
 * كشف حساب المستثمر مع هذا العقد (البند ١٨٨ ج): ما وظّفه، وما أُقرّ له به، وما سُلّم، وما بقي، والعائد.
 * Built only from confirmed linked entries — what both partners agreed happened — so the two sides read the
 * same figures. It is arithmetic on the past, not a promise: the platform guarantees no return.
 */
export default function InvestorStatementCard({ st, locale, role }: { st: InvestorStatement; locale: Locale; role: "owner" | "investor" }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const usd = (v: bigint) => formatMoney(v, "USD");
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const times = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}×`);

  const empty = st.invested === BigInt(0) && st.recognised === BigInt(0) && st.handedOver === BigInt(0) && st.rent === BigInt(0);
  if (empty) {
    return (
      <p className="mt-2 text-sm text-muted">
        {t("لا قيود مؤكَّدة بعد. حين تُؤكَّد القيود بينكما يظهر هنا الحساب.", "No confirmed entries yet. Once the entries between you are confirmed, the account shows here.")}
      </p>
    );
  }

  const rows: [string, string][] = [
    [t("المموَّل من المدخلات", "Inputs financed"), usd(st.invested)],
    [t("نصيب الحصاد المُقرّ به", "Harvest share recognised"), usd(st.recognised)],
    [t("المسلَّم فعلاً", "Actually handed over"), usd(st.handedOver)],
    [role === "owner" ? t("عليك للمستثمر", "You still owe the investor") : t("مستحقٌّ لك", "Still due to you"), usd(st.due > BigInt(0) ? st.due : BigInt(0))],
  ];
  if (st.rent > BigInt(0)) rows.push([t("أجرة مدفوعة", "Rent paid"), usd(st.rent)]);

  return (
    <div className="mt-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-1">
            <dt className="text-muted">{k}</dt>
            <dd className="font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {st.invested > BigInt(0) && (
        <p className="mt-3 text-xs text-muted">
          {t(
            `مضاعف رأس المال: ${times(st.moicRecognised)} بما أُقرّ به، و${times(st.moicCash)} بما سُلّم. العائد السنويّ على ما سُلّم فعلاً: ${pct(st.xirr)}${st.settled ? "" : " (يرتفع حين يُسلَّم الباقي)"}.`,
            `Money multiple: ${times(st.moicRecognised)} on what was recognised, ${times(st.moicCash)} on what was handed over. Yearly return on what was actually paid: ${pct(st.xirr)}${st.settled ? "" : " (it rises as the rest is handed over)"}.`,
          )}{" "}
          {t("حسابٌ للماضي لا وعدٌ بعائد.", "Arithmetic on the past, not a promise of a return.")}
        </p>
      )}
    </div>
  );
}
