import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { dbMessage } from "@/lib/dbMessages";
import { appLocale } from "@/lib/appLocale";
import { tr } from "@/lib/i18n";

/**
 * «خروج» في التطبيق (البند ٢٠٧): ينسى رمز هذا الجوّال قبل أن تنتهي الجلسة، فلا تصله إشعارات حسابٍ خرج منه.
 * As the signed-in person; the database deletes the token only if it is the caller's own (push_device_forget).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: tr(appLocale(req), "انتهت جلستك. ادخل من جديد.", "Your session has ended. Sign in again.") }, { status: 401 });
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: tr(appLocale(req), "طلب غير صالح", "Invalid request") }, { status: 400 });
  }
  if (typeof body.token !== "string") return NextResponse.json({ error: tr(appLocale(req), "رمز الجهاز غير صالح", "The device token is not valid") }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("push_device_forget", { p_token: body.token });
  if (error) return NextResponse.json({ error: dbMessage(error.message, appLocale(req)) }, { status: 400 });
  return NextResponse.json({ ok: true, forgotten: data === true });
}
