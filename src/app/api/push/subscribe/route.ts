import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Registers or stops this browser's push subscription for the signed-in user.
 * The write is a database function that checks the session itself, so a
 * subscription can only ever be filed under its own owner.
 */
export const dynamic = "force-dynamic";

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "اشتراك غير صالح" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_subscribe", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) {
    const status = /سجّل الدخول/.test(error.message) ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, id: data });
}

export async function DELETE(req: NextRequest) {
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  if (typeof body.endpoint !== "string") return NextResponse.json({ error: "اشتراك غير صالح" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_unsubscribe", { p_endpoint: body.endpoint });
  if (error) {
    const status = /سجّل الدخول/.test(error.message) ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, stopped: data === true });
}
