import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { signOffStage } from "@/lib/seasonWrites";

/**
 * «اعتمد المرحلة» من التطبيق (البند ٢٠٣): the website's button on /seasons/[id].
 *
 * The same `signOffStage` the website's action calls, with the app's session. The database's trigger decides: it
 * refuses a stage with no evidence, or one whose earlier stage is still open, and that reason comes back as the error.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
  if (!stageId) return NextResponse.json({ error: "المرحلة غير محدّدة." }, { status: 400 });

  const result = await signOffStage(supabase, { stageId, seasonId: id }, "ar");
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  // Row-level security filters a stage that is not the caller's without an error: say nothing changed.
  if (result.changed === false) {
    return NextResponse.json({ error: "لم تُعتمد المرحلة: ليست من مراحل موسمٍ تملكه." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, message: "اعتُمدت المرحلة." });
}
