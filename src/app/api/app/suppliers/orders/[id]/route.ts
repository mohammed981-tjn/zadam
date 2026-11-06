import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import {
  isNotDeployed,
  type Carrier,
  type Delivery,
  type GroupOrderDetail,
  type GroupOrderLine,
  type Pledge,
} from "@/lib/supplyChain";
import {
  assignDeliveryStep,
  jsonFields,
  markDepositStep,
  pledgeStep,
  setOrderStatusStep,
  setPledgeStatusStep,
  withdrawPledgeStep,
} from "@/lib/supplyCore";
import { UUID, badRequest, dollarRate, noStore, readJson, stepJson } from "@/lib/appApi";

/**
 * One group order in the app (البند ٢٠٣), as /suppliers/orders/[id]: the order (group_order_detail decides what the
 * caller sees of it — the pickup point and the payee account only to those who joined), its lines and what is
 * pledged on each, the pledges row-level security lets the caller read (their own; every one for the organiser), and
 * for the organiser the verified carriers and the order's deliveries. POST is one of the page's forms.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "لا طلب بهذا الرابط." }, { status: 404 });

  const { data, error } = await supabase.rpc("group_order_detail", { p_order: id });
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true }, noStore);
  const order = ((data ?? []) as GroupOrderDetail[])[0] ?? null;
  if (!order) return NextResponse.json({ error: "لا طلب بهذا الرابط." }, { status: 404 });

  const [{ data: lines }, { data: totals }, { data: pledges }, { data: profile }] = await Promise.all([
    supabase.from("group_order_lines").select("*").eq("order_id", order.id).order("position"),
    supabase.rpc("group_order_line_totals", { p_order: order.id }),
    supabase.from("group_order_pledges").select("*").eq("order_id", order.id).order("created_at"),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const organiser = order.my_role === "organiser";
  let carriers: Carrier[] = [];
  let deliveries: Delivery[] = [];
  if (organiser) {
    const [{ data: c }, { data: d }] = await Promise.all([
      supabase.from("carriers").select("*").not("verified_at", "is", null).eq("active", true).order("name"),
      supabase.from("deliveries").select("*").eq("order_id", order.id).order("created_at"),
    ]);
    carriers = (c ?? []) as Carrier[];
    deliveries = (d ?? []) as Delivery[];
  }
  return NextResponse.json(
    {
      order,
      lines: (lines ?? []) as GroupOrderLine[],
      totals: Object.fromEntries(((totals ?? []) as { line_id: string; pledged_qty: number }[]).map((r) => [r.line_id, Number(r.pledged_qty)])),
      pledges: (pledges ?? []) as Pledge[],
      me: user.id,
      my_name: (profile as { full_name: string | null } | null)?.full_name ?? "",
      carriers: carriers.map((c) => ({ id: c.id, name: c.name, vehicle: c.vehicle, capacity_tonnes: c.capacity_tonnes })),
      deliveries,
      ...(await dollarRate()),
    },
    noStore,
  );
}

const STEPS = {
  pledge: pledgeStep,
  withdraw: withdrawPledgeStep,
  deposit: markDepositStep,
  pledge_status: setPledgeStatusStep,
  order_status: setOrderStatusStep,
  assign: assignDeliveryStep,
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { id } = await params;
  const body = await readJson(req);
  const action = String(body?.action ?? "");
  if (!body || !UUID.test(id) || !(action in STEPS)) return badRequest();
  // The order is the one in the address, whatever the body says.
  const step = STEPS[action as keyof typeof STEPS];
  return stepJson(await step(auth.supabase, jsonFields({ ...body, order_id: id }), "ar"));
}
