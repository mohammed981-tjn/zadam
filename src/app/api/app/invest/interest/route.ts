import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { expressInvestorInterest, interestSentSentence } from "@/lib/investSteps";
import { appSay, readJson, text } from "@/lib/appRoute";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «اطلب الشراكة» من التطبيق (البند ٢٠٣): the investor's request to a landowner, with the model, a message and the
 * acknowledged risk notice. The same step as the website's (src/lib/investSteps.ts → investor_express_interest),
 * through the caller's own session.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: tr(locale, "طلبٌ غير مفهوم.", "The request was not understood.") }, { status: 400 });

  const result = await expressInvestorInterest(
    auth.supabase,
    {
      landId: text(body, "land_id", 64),
      model: text(body, "model", 20),
      message: text(body, "message", 4000),
      riskAck: text(body, "risk_ack", 8),
    },
    appSay(locale),
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: interestSentSentence(appSay(locale).t) });
}
