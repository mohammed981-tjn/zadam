import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { moveServiceContract } from "@/lib/contractSteps";
import { appSay, readJson, text } from "@/lib/appRoute";
import { serviceUnitLabel } from "@/lib/services";
import type { ContractMilestone, MilestoneEvidence } from "@/types/database";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * One service contract in the app (backlog 203), as /contracts/[id] reads it: the contract, its phases with their
 * proofs (kind, caption, when and where taken — never the file path), what is paid, and which side the reader is on.
 * Row-level security returns it only to its two parties and to administrators; anyone else gets «لم نجد».
 *
 * POST moves the contract — propose, accept (the provider's signature), withdraw, cancel, close, dispute — through
 * the same step the website's setContractStatus takes (src/lib/contractSteps.ts → service_contracts update, judged by
 * enforce_contract_status). Phases are moved, and proofs uploaded, on the website.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: row } = await supabase
    .from("service_contracts")
    .select("id, title, client_id, status, currency, total_amount, season_id, signed_at, service_providers(name, owner_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: tr(locale, "لم نجد هذا العقد.", "We could not find this contract.") }, { status: 404 });
  const c = row as unknown as {
    id: string;
    title: string;
    client_id: string;
    status: string;
    currency: string;
    total_amount: number;
    season_id: string | null;
    signed_at: string | null;
    service_providers: { name: string; owner_id: string } | null;
  };

  const [{ data: profile }, { data: milestoneRows }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("contract_milestones").select("*").eq("contract_id", id).order("seq"),
  ]);
  const milestones = (milestoneRows ?? []) as ContractMilestone[];
  const { data: proofRows } = milestones.length
    ? await supabase
        .from("milestone_evidence")
        .select("id, milestone_id, kind, caption, latitude, longitude, captured_at")
        .in("milestone_id", milestones.map((m) => m.id))
    : { data: [] };
  const proofs = (proofRows ?? []) as MilestoneEvidence[];
  const paid = milestones.filter((m) => m.status === "paid").reduce((s, m) => s + Number(m.amount), 0);

  return NextResponse.json(
    {
      id: c.id,
      title: c.title,
      status: c.status,
      currency: c.currency,
      total_amount: Number(c.total_amount),
      paid,
      signed_at: c.signed_at,
      season_id: c.season_id,
      provider_name: c.service_providers?.name ?? null,
      is_client: c.client_id === user.id,
      is_provider: c.service_providers?.owner_id === user.id,
      is_admin: (profile as { role: string } | null)?.role === "admin",
      milestones: milestones.map((m) => ({
        id: m.id,
        seq: m.seq,
        title: m.title,
        status: m.status,
        quantity: Number(m.quantity),
        unit: serviceUnitLabel(m.unit, locale),
        unit_price: Number(m.unit_price),
        amount: Number(m.amount),
        planned_start: m.planned_start,
        planned_end: m.planned_end,
        requires_evidence: m.requires_evidence,
        evidence: proofs
          .filter((p) => p.milestone_id === m.id)
          .map((p) => ({
            id: p.id,
            kind: p.kind,
            caption: p.caption,
            captured_at: p.captured_at,
            latitude: p.latitude,
            longitude: p.longitude,
          })),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { id } = await params;
  const body = await readJson(req);
  const status = body ? text(body, "status", 20) : "";

  const result = await moveServiceContract(auth.supabase, id, status, appSay(locale));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
