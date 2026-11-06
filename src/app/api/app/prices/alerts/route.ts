import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { MAX_ACTIVE_ALERTS, createPriceAlertFor, describeAlert, loadPriceAlerts, toAlert } from "@/lib/priceAlerts";

/**
 * «تنبيهات الأسعار» في التطبيق (البند ٢٠٣): the signed-in person's alerts, as /market/alerts lists them, and adding
 * one. Same loader (`loadPriceAlerts`) and same checks and function (`createPriceAlertFor` → `price_alert_create`) as
 * the website's page and action, as this person through row-level security.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  const { markets, options, running, settled } = await loadPriceAlerts(auth.supabase);
  return NextResponse.json(
    {
      max_active: MAX_ACTIVE_ALERTS,
      options,
      running: running.map((r) => ({ id: r.id, text: describeAlert(toAlert(r), markets), created_at: r.created_at })),
      settled: settled.map((r) => ({
        id: r.id,
        text: describeAlert(toAlert(r), markets),
        status: r.status,
        fired_value: r.fired_value === null ? null : Number(r.fired_value),
        fired_market_date: r.fired_market_date,
        settled_at: r.settled_at,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string) => (typeof body[k] === "string" || typeof body[k] === "number" ? String(body[k]).slice(0, 80) : "");

  const result = await createPriceAlertFor(
    auth.supabase,
    { subject: text("subject"), direction: text("direction"), threshold: text("threshold") },
    "ar",
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}
