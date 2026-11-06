import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { forwardStep } from "@/lib/contractSteps";
import { APP_SAY, num, readJson, text } from "@/lib/appRoute";
import { OFFER_UNIT_NAME } from "@/lib/marketOffers";
import {
  FORWARD_EVENT_LABEL,
  FORWARD_STATUS_LABEL,
  type ForwardContract,
  type ForwardEvent,
} from "@/lib/forwardContracts";

/**
 * One forward contract in the app (backlog 203), as /market/forward/[id] reads it: its terms, its two parties (named
 * by the last digits of the number until the other side signs: forward_contract_parties), what happened to it, and
 * who the reader is. Only its two parties and the administration can read it.
 *
 * POST takes a step — sign, decline, withdraw, confirm the delivery, answer or ask a cancellation, raise a dispute —
 * through the same map the website's forwardStep uses (src/lib/contractSteps.ts → forward_contract_*), and the
 * database function behind each decides whether the caller may take it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "لم نجد هذا العقد." }, { status: 404 });

  const [{ data: row }, { data: partyRows }, { data: eventRows }, { data: profile }] = await Promise.all([
    supabase.from("forward_contracts").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("forward_contract_parties", { p_id: id }),
    supabase.from("forward_contract_events").select("id, actor_id, event, note, at").eq("contract_id", id).order("id"),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const c = row as ForwardContract | null;
  if (!c) return NextResponse.json({ error: "لم نجد هذا العقد." }, { status: 404 });
  const parties = ((partyRows ?? []) as {
    buyer_name: string | null;
    buyer_phone: string | null;
    farmer_name: string | null;
    farmer_phone: string | null;
  }[])[0];
  // The proposer typed the other side's number; until they sign, the other side is named by its last digits.
  const named = (name: string | null | undefined, tail: boolean) => name ?? (tail ? `صاحب الرقم …${c.phone_tail}` : "—");
  const actor = (a: string | null) => (a === c.buyer_id ? "المشتري" : a === c.farmer_id ? "المزارع" : "الإدارة");

  return NextResponse.json(
    {
      ...c,
      quantity: Number(c.quantity),
      price: Number(c.price),
      value: Number(c.price) * Number(c.quantity),
      unit_label: OFFER_UNIT_NAME[c.unit]?.ar ?? c.unit,
      status_label: FORWARD_STATUS_LABEL[c.status]?.[0] ?? c.status,
      me: user.id,
      is_admin: (profile as { role: string } | null)?.role === "admin",
      farmer_name: named(parties?.farmer_name, c.proposed_by !== c.farmer_id),
      farmer_phone: parties?.farmer_phone ?? null,
      buyer_name: named(parties?.buyer_name, c.proposed_by !== c.buyer_id),
      buyer_phone: parties?.buyer_phone ?? null,
      events: ((eventRows ?? []) as ForwardEvent[]).map((e) => ({
        id: e.id,
        at: e.at,
        label: FORWARD_EVENT_LABEL[e.event]?.[0] ?? e.event,
        actor: e.event === "proposed" ? null : actor(e.actor_id),
        note: e.note,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });

  const result = await forwardStep(
    auth.supabase,
    id,
    text(body, "step", 20),
    {
      reason: text(body, "reason", 1000),
      deliveredQuantity: num(body, "delivered_quantity"),
      deliveredOn: text(body, "delivered_on", 10),
      gradeMet: text(body, "grade_met", 3),
    },
    APP_SAY,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: "تمّ، وأُخبر الطرف الآخر." });
}
