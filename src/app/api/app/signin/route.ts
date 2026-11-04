import { NextResponse } from "next/server";
import { translateAuthError } from "@/lib/auth-errors";
import { toE164 } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";
import { passwordSession } from "@/lib/supabase/bearer";

/**
 * الدخول من التطبيق (البند ١٣٨).
 *
 * The owner chose full sign-in inside the app. The app sends what the website's
 * login form sends — a country code and a number, or an email, and a password —
 * and gets back the session to keep on the phone. The number is read by the
 * same `toE164` and folded by the same `phoneToEmail` as the website's login,
 * so an account made on one opens on the other and there is one rule for what
 * a Sudanese number looks like.
 *
 * Throttled per address, and closed when the limiter cannot be asked: this is
 * a password guess endpoint.
 */
export async function POST(req: Request) {
  const verdict = await checkRateLimit("app-auth", clientAddress(req.headers));
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر دقيقةً ثمّ أعد المحاولة." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });
  }
  const text = (k: string) => String(body[k] ?? "").trim();
  const method = text("method") === "email" ? "email" : "phone";
  const password = text("password");
  if (!password) return NextResponse.json({ error: "أدخل كلمة المرور." }, { status: 400 });

  let email: string;
  if (method === "email") {
    email = text("email");
    if (!email.includes("@")) {
      return NextResponse.json({ error: "أدخل بريدك الإلكتروني." }, { status: 400 });
    }
  } else {
    const phone = toE164(text("dial_code"), text("phone"), "ar");
    if (!phone.ok) return NextResponse.json({ error: phone.message }, { status: 400 });
    email = phoneToEmail(phone.e164);
  }

  const result = await passwordSession(email, password);
  if ("mustChange" in result) {
    return NextResponse.json({ error: result.error, must_change_password: true }, { status: 403 });
  }
  if ("error" in result) {
    return NextResponse.json({ error: translateAuthError(result.error ?? "", method, "ar") }, { status: 401 });
  }
  return NextResponse.json(result.session, { headers: { "cache-control": "no-store" } });
}
