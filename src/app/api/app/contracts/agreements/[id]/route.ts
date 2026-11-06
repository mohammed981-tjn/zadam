import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { AGREEMENT_TITLE, agreementClauses, signerRoles, type AgreementView } from "@/lib/agreements";
import { investorStatement, returnSentence } from "@/lib/ledgerLinks";
import { loadLinks } from "@/lib/ledgerLinksLoad";
import { formatMoney } from "@/lib/ledger/money";
import { appSay } from "@/lib/appRoute";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * One partnership agreement in the app (backlog 203), as /invest/agreements/[id] shows it: the contract's text,
 * built by the website's own `agreementClauses` from the stored terms — the same terms the fingerprint is computed
 * over, so what the reader signs is what they read — the signatures, the fingerprint, the season that carries it out,
 * how the harvest is split by its terms, and, once signed, the account between the two partners from their
 * confirmed linked entries.
 *
 * `partnership_agreement_view` returns it only to its parties and administrators. Signing is ./sign; the terms are
 * written on the website.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase.rpc("partnership_agreement_view", { p_agreement: id });
  if (error || !data) return NextResponse.json({ error: tr(locale, "لم نجد هذا العقد.", "We could not find this contract.") }, { status: 404 });
  const a = data as AgreementView;
  const signed = a.status === "signed";
  const party = a.me === "owner" || a.me === "investor";

  const { data: seasonRows } = signed
    ? await supabase.from("seasons").select("id, name, status").eq("partnership_id", a.id).order("planting_date", { ascending: false })
    : { data: null };

  // The account between the two partners (backlog 188): confirmed linked entries only, so both read the same figures.
  let statement: { rows: { label: string; value: string }[]; note: string | null } | null = null;
  if (signed && party) {
    const st = investorStatement((await loadLinks(supabase)).filter((l) => l.agreement_id === a.id));
    const zero = BigInt(0);
    const empty = st.invested === zero && st.recognised === zero && st.handedOver === zero && st.rent === zero;
    const usd = (v: bigint) => formatMoney(v, "USD");
    const times = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}×`);
    statement = empty
      ? { rows: [], note: tr(locale, "لا قيود مؤكَّدة بعد. حين تُؤكَّد القيود بينكما يظهر هنا الحساب.", "No confirmed entries yet. Once the entries between you are confirmed, the account shows here.") }
      : {
          rows: [
            { label: tr(locale, "المموَّل من المدخلات", "Inputs financed"), value: usd(st.invested) },
            { label: tr(locale, "نصيب الحصاد المُقرّ به", "Harvest share recognised"), value: usd(st.recognised) },
            { label: tr(locale, "المسلَّم فعلاً", "Actually handed over"), value: usd(st.handedOver) },
            { label: a.me === "owner" ? tr(locale, "عليك للمستثمر", "You still owe the investor") : tr(locale, "مستحقٌّ لك", "Still due to you"), value: usd(st.due > zero ? st.due : zero) },
            ...(st.rent > zero ? [{ label: tr(locale, "أجرة مدفوعة", "Rent paid"), value: usd(st.rent) }] : []),
          ],
          note:
            st.invested > zero
              ? tr(locale, `مضاعف رأس المال: ${times(st.moicRecognised)} بما أُقرّ به، و${times(st.moicCash)} بما سُلّم. ${returnSentence(st, appSay(locale).t)} حسابٌ للماضي لا وعدٌ بعائد.`, `Multiple on capital: ${times(st.moicRecognised)} on what was acknowledged, and ${times(st.moicCash)} on what was handed over. ${returnSentence(st, appSay("en").t)} An account of the past, not a promise of return.`)
              : null,
        };
  }

  const x = a.terms;
  const who = (r: string) => (r === "owner" ? tr(locale, "صاحب الأرض", "Landowner") : r === "investor" ? tr(locale, "المستثمر", "Investor") : tr(locale, "الشركة المديرة", "Managing company"));
  const roles = signerRoles(a.model);

  return NextResponse.json(
    {
      id: a.id,
      ref: a.ref,
      title: AGREEMENT_TITLE[a.model]?.[locale] ?? a.model,
      model: a.model,
      status: a.status,
      version: a.version,
      terms_hash: a.terms_hash,
      signed_at: a.signed_at,
      me: a.me,
      earlier_signatures: a.earlier_signatures,
      clauses: agreementClauses(a, locale),
      roles: roles.map((r) => ({ role: r, label: who(r) })),
      signatures: a.signatures.map((s) => ({
        role: s.role,
        label: who(s.role),
        full_name: s.full_name,
        signature: s.signature,
        signed_at: s.signed_at,
      })),
      // Who gets what share, from the terms as written (the calculator in ./split works the amounts out).
      shares: [
        ...(x.manager_share !== undefined ? [{ label: tr(locale, "الشركة المديرة (من صافي الربح)", "Managing company (from net profit)"), pct: x.manager_share }] : []),
        ...(x.owner_share !== undefined ? [{ label: tr(locale, "صاحب الأرض", "Landowner"), pct: x.owner_share }] : []),
        ...(x.investor_share !== undefined ? [{ label: tr(locale, "المستثمر", "Investor"), pct: x.investor_share }] : []),
      ],
      rent: a.model === "lease" && x.rent_amount ? `${Number(x.rent_amount).toLocaleString("en-US")} ${x.currency ?? ""}`.trim() : null,
      seasons: ((seasonRows ?? []) as { id: string; name: string; status: string }[]).map((s) => ({
        id: s.id,
        name: s.name,
        status_label: s.status === "completed" ? tr(locale, "مكتمل", "Completed") : tr(locale, "جارٍ", "Running"),
      })),
      statement,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
