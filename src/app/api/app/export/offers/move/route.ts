import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { moveExportOffer } from "@/lib/exportCorridors";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «أرسل للمراجعة» · «أعده مسوّدة» · «اسحبه» في التطبيق (البند ٢٠٣): the website's `moveOffer`, through the same
 * `moveExportOffer` — a closed list here, the state-machine trigger and the row-level policy in the database. Nothing
 * here can publish: that is the reviewer's act.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const to = typeof body.to === "string" ? body.to : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: tr(locale, "عرضٌ غير معروف.", "Unknown offer.") }, { status: 400 });

  const result = await moveExportOffer(auth.supabase, auth.user.id, id, to, locale);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}
