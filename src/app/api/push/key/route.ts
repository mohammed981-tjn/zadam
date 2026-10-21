import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVapidKeys } from "@/lib/push";

/** The public half of the push key pair, which the browser needs to subscribe. Public by nature. */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "التنبيهات غير مهيّأة على هذا النشر." }, { status: 503 });
  const keys = await ensureVapidKeys(admin);
  if (!keys) return NextResponse.json({ error: "تعذّر تجهيز المفاتيح." }, { status: 503 });
  return NextResponse.json({ publicKey: keys.publicKey }, { headers: { "cache-control": "public, max-age=3600" } });
}
