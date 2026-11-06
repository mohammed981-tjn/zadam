import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { explain } from "@/lib/supplyActions";
import { readJson, text } from "@/lib/appRoute";
import { OFFER_UNIT_NAME } from "@/lib/marketOffers";
import { FORWARD_STATUS_LABEL, type ForwardContract } from "@/lib/forwardContracts";
import { AGREEMENT_TITLE, signerRoles } from "@/lib/agreements";
import type { InvestorModel } from "@/lib/investors";

/**
 * «عقودي» في التطبيق (البند ٢٠٣): every contract the reader is a party to, as the website lists them —
 *
 *   • service contracts, as /contracts lists them: row-level security returns exactly those where the caller is the
 *     client or the provider (or an administrator), so nothing is filtered here, as nothing is there;
 *   • forward contracts, as /market/forward lists them: the caller's own as buyer or farmer, and for an
 *     administrator the disputes waiting on the administration;
 *   • partnership agreements: those where the caller is the landowner, the investor, or owns the managing company —
 *     the website reaches each from «طلباتي», «أراضيّ» and «شركتي»; here they are in one list, with whether the
 *     current version still waits for the caller's signature.
 *
 * POST opens (or reopens) the agreement of an accepted request, as «اكتبا العقد ووقّعاه هنا» does on the website
 * (`partnership_agreement_open`, which checks the caller is a party and the request accepted).
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const me = user.id;

  const [{ data: serviceRows }, { data: forwardRows }, { data: profile }, { data: agreementRows }, { data: companyRows }] =
    await Promise.all([
      supabase
        .from("service_contracts")
        .select("id, title, status, currency, total_amount, created_at, service_providers(name)")
        .order("created_at", { ascending: false }),
      supabase.from("forward_contracts").select("*").order("proposed_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("role").eq("id", me).maybeSingle(),
      supabase
        .from("partnership_agreements")
        .select("id, ref, model, status, version, signed_at, updated_at, owner_id, investor_id, manager_company_id")
        .order("updated_at", { ascending: false }),
      supabase.from("partner_companies").select("id").eq("owner_id", me),
    ]);
  const isAdmin = (profile as { role: string } | null)?.role === "admin";

  const forwardJson = (c: ForwardContract) => ({
    id: c.id,
    ref: c.ref,
    crop: c.crop,
    quantity: Number(c.quantity),
    unit: OFFER_UNIT_NAME[c.unit]?.ar ?? c.unit,
    price: Number(c.price),
    currency: c.currency,
    delivery_from: c.delivery_from,
    delivery_to: c.delivery_to,
    delivery_place: c.delivery_place,
    status: c.status,
    status_label: FORWARD_STATUS_LABEL[c.status]?.[0] ?? c.status,
    buyer_id: c.buyer_id,
    farmer_id: c.farmer_id,
    proposed_by: c.proposed_by,
    cancel_requested_by: c.cancel_requested_by,
  });
  const forward = ((forwardRows ?? []) as ForwardContract[]).filter((c) => c.buyer_id === me || c.farmer_id === me);
  const disputes = isAdmin ? ((forwardRows ?? []) as ForwardContract[]).filter((c) => c.status === "disputed") : [];

  // Partnership agreements the caller is a party to, and whether the current version waits for their signature.
  const myCompanies = new Set(((companyRows ?? []) as { id: string }[]).map((c) => c.id));
  type AgreementRow = {
    id: string;
    ref: string | null;
    model: InvestorModel;
    status: "draft" | "signed";
    version: number;
    signed_at: string | null;
    updated_at: string;
    owner_id: string;
    investor_id: string;
    manager_company_id: string | null;
  };
  const agreements = ((agreementRows ?? []) as AgreementRow[])
    .map((a) => ({
      ...a,
      me:
        a.owner_id === me
          ? ("owner" as const)
          : a.investor_id === me
            ? ("investor" as const)
            : a.manager_company_id && myCompanies.has(a.manager_company_id)
              ? ("manager" as const)
              : null,
    }))
    .filter((a) => a.me !== null);
  const { data: signatureRows } = agreements.length
    ? await supabase
        .from("partnership_signatures")
        .select("agreement_id, version, role")
        .in("agreement_id", agreements.map((a) => a.id))
    : { data: [] };
  const signatures = (signatureRows ?? []) as { agreement_id: string; version: number; role: string }[];

  return NextResponse.json(
    {
      me,
      is_admin: isAdmin,
      service: ((serviceRows ?? []) as unknown as {
        id: string;
        title: string;
        status: string;
        currency: string;
        total_amount: number;
        created_at: string;
        service_providers: { name: string } | null;
      }[]).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        currency: c.currency,
        total_amount: Number(c.total_amount),
        created_at: c.created_at,
        provider_name: c.service_providers?.name ?? null,
      })),
      forward: forward.map(forwardJson),
      forward_disputes: disputes.map(forwardJson),
      agreements: agreements.map((a) => {
        const signedNow = signatures.filter((s) => s.agreement_id === a.id && s.version === a.version).map((s) => s.role);
        return {
          id: a.id,
          ref: a.ref,
          title: AGREEMENT_TITLE[a.model]?.ar ?? a.model,
          model: a.model,
          status: a.status,
          version: a.version,
          signed_at: a.signed_at,
          updated_at: a.updated_at,
          me: a.me,
          signed_by_me: signedNow.includes(a.me as string),
          waiting: signerRoles(a.model).filter((r) => !signedNow.includes(r)),
        };
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const body = await readJson(req);
  const interest = body ? text(body, "interest_id", 64) : "";
  const { data, error } = await auth.supabase.rpc("partnership_agreement_open", { p_interest: interest });
  if (error || !data) return NextResponse.json({ error: explain("ar", error) }, { status: 400 });
  return NextResponse.json({ id: data });
}
