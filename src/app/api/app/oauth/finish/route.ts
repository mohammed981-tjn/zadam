import { NextResponse } from "next/server";
import { openSession } from "@/lib/appHandoff";

/**
 * يستلم التطبيق جلسته بعد الدخول بـGoogle (البند ١٧٣): الختم الذي حمله الرابط، والسرّ الذي صنعه قبل أن يخرج.
 * Nothing else opens the seal (lib/appHandoff); the reply is the session the app keeps, the shape `/api/app/signin`
 * gives.
 */
export async function POST(req: Request) {
  let body: { handoff?: unknown; verifier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const opened = openSession(String(body.handoff ?? ""), String(body.verifier ?? ""));
  if (!opened.ok) {
    return NextResponse.json(
      {
        error:
          opened.reason === "expired"
            ? "انتهت مهلة الدخول. اضغط «الدخول بحساب Google» مرّةً أخرى."
            : "لم يكتمل الدخول بهذا الحساب. جرّب مرّةً أخرى.",
      },
      { status: 401 },
    );
  }
  return NextResponse.json(opened.session, { headers: { "cache-control": "no-store" } });
}
