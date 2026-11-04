import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";

/**
 * «أرضي · استثماري» في التطبيق (البند ١٧٣): ما يفعله `switchSide` في الموقع (src/app/side/actions.ts).
 *
 * One account does both (backlog 151); the switch only says which side the person is on now, by moving
 * `profiles.role` between 'farmer' and 'investor' — the one change `prevent_self_role_escalation` lets a person make
 * for themselves. An administrator stays one: the update matches only those two roles.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  let side: unknown;
  try {
    side = ((await req.json()) as { side?: unknown }).side;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  if (side !== "farmer" && side !== "investor") {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: side })
    .eq("id", user.id)
    .in("role", ["farmer", "investor"])
    .select("role")
    .maybeSingle();
  if (error) {
    console.error("app side:", error.message);
    return NextResponse.json({ error: "تعذّر تغيير الجانب الآن." }, { status: 500 });
  }
  return NextResponse.json({ role: (data as { role?: string } | null)?.role ?? null });
}
