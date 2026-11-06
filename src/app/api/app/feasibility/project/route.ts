import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { createPlanFromStudyCore } from "@/lib/studyProject";

/**
 * «حوّلها إلى مشروع» من دراسة الجدوى في التطبيق (البند ٢٠٣): كما يحفظها زرّ الموقع.
 *
 * As the signed-in person, through `createPlanFromStudyCore` — the function the website's `createPlanFromStudy`
 * action now calls — so the same checks run and the same database function (`input_plan_create`) decides. The list
 * of inputs is built on the server from the crop's sources; the phone sends only the crop and the area.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const feddans = typeof body.feddans === "number" ? body.feddans : text("feddans") ? Number(text("feddans")) : null;

  const done = await createPlanFromStudyCore(
    auth.supabase,
    { crop: text("crop"), feddans: feddans !== null && Number.isFinite(feddans) ? feddans : null, title: text("title"), landId: text("land_id") || null },
    "ar",
  );
  if (!done.ok) return NextResponse.json({ error: done.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: done.message });
}
