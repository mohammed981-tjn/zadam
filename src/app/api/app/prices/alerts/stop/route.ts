import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { stopPriceAlertFor } from "@/lib/priceAlerts";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «أوقف» في التطبيق (البند ٢٠٣): stops one of the signed-in person's running alerts, as the website's button does —
 * through `price_alert_stop`, which acts only on the caller's own rows. The alert is not deleted; it stays on record
 * as stopped, under «ما انتهى».
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);

  let id = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const error = await stopPriceAlertFor(auth.supabase, id, locale);
  if (error) return NextResponse.json({ error: tr(locale, `تعذّر إيقاف التنبيه: ${error}`, `Could not stop the alert: ${error}`) }, { status: 400 });
  return NextResponse.json({ ok: true, message: tr(locale, "أوقفنا التنبيه.", "The alert was stopped.") });
}
