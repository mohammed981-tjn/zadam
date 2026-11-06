import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { answerLink, isLinkAnswer } from "@/lib/ledgerLinkWrites";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * الردّ على اقتراحات الشريك من التطبيق (البند ٢٠٣): the buttons of «اقتراحات الشريك» on /books.
 *
 * `action` is one of the website's: confirm, reject, cancel, request_reversal, accept_reversal, reject_reversal,
 * withdraw_reversal. Each goes through the same `answerLink` the website's actions call, with the app's session, so
 * the database's functions check that the caller is the right party of the agreement, and their refusals come back in
 * the website's words.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const text = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
  const action = text("action", 30);
  if (!isLinkAnswer(action)) return NextResponse.json({ error: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") }, { status: 400 });

  const result = await answerLink(
    supabase,
    action,
    { linkId: text("link_id", 40), reversalId: text("reversal_id", 40), account: text("account", 10), reason: text("reason", 400) },
    locale,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}
