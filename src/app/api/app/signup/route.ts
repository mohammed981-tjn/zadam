import { NextResponse } from "next/server";
import { translateAuthError } from "@/lib/auth-errors";
import { toE164 } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordSession } from "@/lib/supabase/bearer";
import { MIN_PASSWORD } from "@/lib/authEntry";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * إنشاء حسابٍ من التطبيق (البند ١٣٨).
 *
 * The owner, 22 October: «إذا أراد الاستثمار أو تسجيل الأرض… يسجّل مثله ومثل
 * الويب». So the app creates the same account the website's phone signup does
 * (src/app/login/actions.ts, `signup`): the number folded into its internal
 * address, the account created already confirmed through the admin API
 * because that address has no inbox, the real number and the chosen role in
 * the metadata the `handle_new_user` trigger reads — and that trigger, not
 * this route, is what keeps a signup from becoming anything but a farmer or an
 * investor.
 *
 * Phone only. An email signup waits on a confirmation link, which the website
 * handles and an app has nowhere to land.
 *
 * Throttled per address, and closed when the limiter cannot be asked: the
 * admin API creates accounts without any limit of its own.
 */
export async function POST(req: Request) {
  const locale = appLocale(req);
  const verdict = await checkRateLimit("app-auth", clientAddress(req.headers));
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: tr(locale, "محاولاتٌ كثيرة في وقتٍ قصير. انتظر دقيقةً ثمّ أعد المحاولة.", "Too many attempts in a short time. Wait a minute and try again.") },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير مفهوم.", "The request was not understood.") }, { status: 400 });
  }
  const text = (k: string) => String(body[k] ?? "").trim();
  const fullName = text("full_name");
  const password = text("password");
  const role = text("role") === "investor" ? "investor" : "farmer";

  if (!fullName) return NextResponse.json({ error: tr(locale, "اكتب اسمك.", "Write your name.") }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: tr(locale, `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل.`, `The password must be at least ${MIN_PASSWORD} characters.`) }, { status: 400 });
  }
  const phone = toE164(text("dial_code"), text("phone"), locale);
  if (!phone.ok) return NextResponse.json({ error: phone.message }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) {
    console.error("app signup: SUPABASE_SERVICE_ROLE_KEY is not set for this deployment.");
    return NextResponse.json(
      { error: tr(locale, "إنشاء الحساب غير متاح الآن من التطبيق. أنشئه من الموقع، ثمّ ادخل به هنا.", "Creating an account is not available from the app right now. Create it on the website, then sign in with it here.") },
      { status: 503 },
    );
  }

  const email = phoneToEmail(phone.e164);
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone.e164, role },
  });
  if (createError) {
    return NextResponse.json({ error: translateAuthError(createError.message, "phone", locale) }, { status: 400 });
  }

  const result = await passwordSession(email, password);
  if ("error" in result) {
    return NextResponse.json(
      { error: tr(locale, "أُنشئ حسابك. ادخل برقمك وكلمة مرورك.", "Your account was created. Sign in with your number and password."), created: true },
      { status: 202 },
    );
  }
  return NextResponse.json(result.session, { status: 201, headers: { "cache-control": "no-store" } });
}
