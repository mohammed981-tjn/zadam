import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { signPartnershipAgreement, signedSentence } from "@/lib/contractSteps";
import { appSay, num, readJson, text } from "@/lib/appRoute";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «وقّع العقد» من التطبيق (البند ٢٠٣): a partnership agreement signed on the phone, exactly as on the website.
 *
 * The website's signAgreement and this route hand the same four things to the same step
 * (src/lib/contractSteps.ts → signPartnershipAgreement → partnership_agreement_sign): the ticked confirmation
 * «قرأتُ العقد كاملاً وأوافق على بنوده» (`agree: "yes"`), the signature drawn with a finger in the same 600×200 space
 * and shape the table checks, the full name as on the signer's ID, and the version and fingerprint the signer was
 * shown — a signature on any other version is refused. The database checks the signer is a party, the land is still
 * verified and its verified area covers the agreement, and seals it when the last party signs. The website asks for
 * no fresh sign-in to sign, so neither does this; the user agent is read from the request, as the website reads it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: tr(locale, "طلبٌ غير مفهوم.", "The request was not understood.") }, { status: 400 });

  const result = await signPartnershipAgreement(
    auth.supabase,
    {
      agreementId: id,
      version: num(body, "version") ?? 0,
      hash: text(body, "hash", 200),
      fullName: text(body, "full_name", 200),
      signature: typeof body.signature === "string" ? body.signature.trim() : "",
      agree: text(body, "agree", 8),
      userAgent: req.headers.get("user-agent"),
    },
    appSay(locale),
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, ref: result.data, message: signedSentence(result.data, appSay(locale).t) });
}
