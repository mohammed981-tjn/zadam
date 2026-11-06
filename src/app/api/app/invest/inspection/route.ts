import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { inspectionSentSentence, requestLandInspection } from "@/lib/investSteps";
import { APP_SAY, list, readJson, text } from "@/lib/appRoute";

/**
 * «اطلب تقرير معاينةٍ مستقلّ» من التطبيق (البند ٢٠٣): the paid, independent inspection report on a land offered to
 * investors. The same step as the website's requestInspection (src/lib/investSteps.ts → land_inspection_request).
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });

  const result = await requestLandInspection(
    auth.supabase,
    { landId: text(body, "land_id", 64), checks: list(body, "checks"), note: text(body, "note", 1000) },
    APP_SAY,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.data, message: inspectionSentSentence(APP_SAY.t) });
}
