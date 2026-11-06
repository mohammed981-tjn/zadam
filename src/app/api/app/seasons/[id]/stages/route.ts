import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { signOffStage } from "@/lib/seasonWrites";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «اعتمد المرحلة» من التطبيق (البند ٢٠٣): the website's button on /seasons/[id].
 *
 * The same `signOffStage` the website's action calls, with the app's session. The database's trigger decides: it
 * refuses a stage with no evidence, or one whose earlier stage is still open, and that reason comes back as the error.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
  if (!stageId) return NextResponse.json({ error: tr(locale, "المرحلة غير محدّدة.", "The stage is not specified.") }, { status: 400 });

  const result = await signOffStage(supabase, { stageId, seasonId: id }, locale);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  // Row-level security filters a stage that is not the caller's without an error: say nothing changed.
  if (result.changed === false) {
    return NextResponse.json({ error: tr(locale, "لم تُعتمد المرحلة: ليست من مراحل موسمٍ تملكه.", "The stage was not signed off: it is not a stage of a season you own.") }, { status: 403 });
  }
  return NextResponse.json({ ok: true, message: tr(locale, "اعتُمدت المرحلة.", "The stage was signed off.") });
}
