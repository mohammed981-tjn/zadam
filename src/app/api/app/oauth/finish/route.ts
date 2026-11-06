import { NextResponse } from "next/server";
import { openSession } from "@/lib/appHandoff";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * يستلم التطبيق جلسته بعد الدخول بـGoogle (البند ١٧٣): الختم الذي حمله الرابط، والسرّ الذي صنعه قبل أن يخرج.
 * Nothing else opens the seal (lib/appHandoff); the reply is the session the app keeps, the shape `/api/app/signin`
 * gives.
 */
export async function POST(req: Request) {
  const locale = appLocale(req);
  let body: { handoff?: unknown; verifier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const opened = openSession(String(body.handoff ?? ""), String(body.verifier ?? ""));
  if (!opened.ok) {
    return NextResponse.json(
      {
        error:
          opened.reason === "expired"
            ? tr(locale, "انتهت مهلة الدخول. اضغط «الدخول بحساب Google» مرّةً أخرى.", "The sign-in timed out. Press «Sign in with Google» again.")
            : tr(locale, "لم يكتمل الدخول بهذا الحساب. جرّب مرّةً أخرى.", "Signing in with this account did not finish. Try again."),
      },
      { status: 401 },
    );
  }
  return NextResponse.json(opened.session, { headers: { "cache-control": "no-store" } });
}
