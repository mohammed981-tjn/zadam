import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { consentSentence, setInvestorConsent } from "@/lib/investSteps";
import { appSay, list, readJson, text } from "@/lib/appRoute";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «اعرض أرضي على المستثمرين» من التطبيق (البند ٢٠٣): the landowner opens a verified land to investors with the
 * models they accept, or closes it. The same step as the website's setInvestorConsent (src/lib/investSteps.ts →
 * land_set_investor_consent), which checks the land is the caller's and verified. The app pre-ticks every model, or
 * the ones chosen last time, as the website's form does — one tap.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: tr(locale, "طلبٌ غير مفهوم.", "The request was not understood.") }, { status: 400 });

  const open = body.open === true || body.open === "true";
  const result = await setInvestorConsent(
    auth.supabase,
    auth.user.id,
    { landId: text(body, "land_id", 64), open, models: list(body, "models"), note: text(body, "note", 500) },
    appSay(locale),
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: consentSentence(open, appSay(locale).t) });
}
