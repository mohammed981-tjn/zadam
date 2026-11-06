import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { explain } from "@/lib/supplyActions";
import { readJson, text } from "@/lib/appRoute";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * A partnership request after it was sent (backlog 203): the investor withdraws a pending one
 * (`investor_interest_withdraw`), and the landowner accepts or declines one on their land (`land_investor_decide`) —
 * the website's withdrawInvestorInterest and decideInvestorInterest, the same functions with the same arguments.
 * Each function checks who is asking; a stranger's request is refused there.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { id } = await params;
  const body = await readJson(req);
  const action = body ? text(body, "action", 12) : "";

  if (action === "withdraw") {
    const { error } = await auth.supabase.rpc("investor_interest_withdraw", { p_interest: id });
    if (error) return NextResponse.json({ error: explain(locale, error) }, { status: 400 });
    return NextResponse.json({ ok: true, message: tr(locale, "سُحب الطلب.", "Request withdrawn.") });
  }
  if (action === "accept" || action === "decline") {
    const accept = action === "accept";
    const { error } = await auth.supabase.rpc("land_investor_decide", { p_interest: id, p_accept: accept });
    if (error) return NextResponse.json({ error: explain(locale, error) }, { status: 400 });
    return NextResponse.json({
      ok: true,
      message: accept
        ? tr(locale, "قبلتَ الطلب. يرى المستثمر الآن اسمك وهاتفك وموقع الأرض، وترى هاتفه هنا. اتّفقا كتابةً قبل أيّ دفع.", "You accepted. The investor now sees your name, phone and the land's location, and you see their phone here. Agree in writing before any payment.")
        : tr(locale, "اعتذرتَ عن الطلب، ووصل المستثمرَ الجواب.", "You declined, and the investor has been told."),
    });
  }
  return NextResponse.json({ error: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") }, { status: 400 });
}
