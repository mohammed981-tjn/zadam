import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { dbMessage } from "@/lib/dbMessages";
import { appLocale } from "@/lib/appLocale";
import { tr } from "@/lib/i18n";

/**
 * «إشعارات الجوّال» في «حسابي» (البند ٢٠٧): تشغيلٌ وإطفاء للحساب كلّه، كالمفتاح نفسه في صفحة الإشعارات على الموقع.
 * As the signed-in person (push_app_set).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: tr(appLocale(req), "انتهت جلستك. ادخل من جديد.", "Your session has ended. Sign in again.") }, { status: 401 });
  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: tr(appLocale(req), "طلب غير صالح", "Invalid request") }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: tr(appLocale(req), "طلب غير صالح", "Invalid request") }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("push_app_set", { p_enabled: body.enabled });
  if (error) return NextResponse.json({ error: dbMessage(error.message, appLocale(req)) }, { status: 400 });
  return NextResponse.json({ ok: true, enabled: data !== false });
}
