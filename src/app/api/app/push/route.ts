import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { dbMessage } from "@/lib/dbMessages";
import { appLocale } from "@/lib/appLocale";
import { tr } from "@/lib/i18n";

/**
 * إشعارات الجوّال في التطبيق (البند ٢٠٧): رمز هذا الجوّال، بعد الدخول.
 *
 *   GET  /api/app/push  → { enabled, devices }: «إشعارات الجوّال» في «حسابي».
 *   POST /api/app/push  { token, platform, locale } → يسجّل رمز FCM لهذا الجوّال.
 *
 * As the signed-in person, with the app's bearer session; no service key. The database function files the token
 * under the session's own user (push_device_register), so a token can only ever be registered to its owner.
 */
export const dynamic = "force-dynamic";

const EXPIRED = "انتهت جلستك. ادخل من جديد.";

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: tr(appLocale(req), EXPIRED, "Your session has ended. Sign in again.") }, { status: 401 });
  const { data, error } = await auth.supabase.rpc("push_app_status");
  if (error) return NextResponse.json({ error: dbMessage(error.message, appLocale(req)) }, { status: 400 });
  const s = (data ?? {}) as { enabled?: boolean; devices?: number };
  return NextResponse.json({ enabled: s.enabled !== false, devices: Number(s.devices ?? 0) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: tr(appLocale(req), EXPIRED, "Your session has ended. Sign in again.") }, { status: 401 });
  let body: { token?: unknown; platform?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: tr(appLocale(req), "طلب غير صالح", "Invalid request") }, { status: 400 });
  }
  if (typeof body.token !== "string" || typeof body.platform !== "string") {
    return NextResponse.json({ error: tr(appLocale(req), "رمز الجهاز غير صالح", "The device token is not valid") }, { status: 400 });
  }
  const { data, error } = await auth.supabase.rpc("push_device_register", {
    p_token: body.token,
    p_platform: body.platform,
    p_locale: body.locale === "en" ? "en" : "ar",
  });
  if (error) return NextResponse.json({ error: dbMessage(error.message, appLocale(req)) }, { status: 400 });
  return NextResponse.json({ ok: true, id: data });
}
