import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { AGREEMENT_TITLE, agreementClauses, signerRoles, type AgreementView } from "@/lib/agreements";
import { investorStatement, returnSentence } from "@/lib/ledgerLinks";
import { loadLinks } from "@/lib/ledgerLinksLoad";
import { formatMoney } from "@/lib/ledger/money";
import { APP_SAY } from "@/lib/appRoute";

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
  const { supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase.rpc("partnership_agreement_view", { p_agreement: id });
  if (error || !data) return NextResponse.json({ error: "لم نجد هذا العقد." }, { status: 404 });
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
      ? { rows: [], note: "لا قيود مؤكَّدة بعد. حين تُؤكَّد القيود بينكما يظهر هنا الحساب." }
      : {
          rows: [
            { label: "المموَّل من المدخلات", value: usd(st.invested) },
            { label: "نصيب الحصاد المُقرّ به", value: usd(st.recognised) },
            { label: "المسلَّم فعلاً", value: usd(st.handedOver) },
            { label: a.me === "owner" ? "عليك للمستثمر" : "مستحقٌّ لك", value: usd(st.due > zero ? st.due : zero) },
            ...(st.rent > zero ? [{ label: "أجرة مدفوعة", value: usd(st.rent) }] : []),
          ],
          note:
            st.invested > zero
              ? `مضاعف رأس المال: ${times(st.moicRecognised)} بما أُقرّ به، و${times(st.moicCash)} بما سُلّم. ${returnSentence(st, APP_SAY.t)} حسابٌ للماضي لا وعدٌ بعائد.`
              : null,
        };
  }

  const x = a.terms;
  const who = (r: string) => (r === "owner" ? "صاحب الأرض" : r === "investor" ? "المستثمر" : "الشركة المديرة");
  const roles = signerRoles(a.model);

  return NextResponse.json(
    {
      id: a.id,
      ref: a.ref,
      title: AGREEMENT_TITLE[a.model]?.ar ?? a.model,
      model: a.model,
      status: a.status,
      version: a.version,
      terms_hash: a.terms_hash,
      signed_at: a.signed_at,
      me: a.me,
      earlier_signatures: a.earlier_signatures,
      clauses: agreementClauses(a, "ar"),
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
        ...(x.manager_share !== undefined ? [{ label: "الشركة المديرة (من صافي الربح)", pct: x.manager_share }] : []),
        ...(x.owner_share !== undefined ? [{ label: "صاحب الأرض", pct: x.owner_share }] : []),
        ...(x.investor_share !== undefined ? [{ label: "المستثمر", pct: x.investor_share }] : []),
      ],
      rent: a.model === "lease" && x.rent_amount ? `${Number(x.rent_amount).toLocaleString("en-US")} ${x.currency ?? ""}`.trim() : null,
      seasons: ((seasonRows ?? []) as { id: string; name: string; status: string }[]).map((s) => ({
        id: s.id,
        name: s.name,
        status_label: s.status === "completed" ? "مكتمل" : "جارٍ",
      })),
      statement,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
