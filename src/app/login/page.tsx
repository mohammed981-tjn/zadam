import Link from "next/link";
import { login, resendConfirmation } from "./actions";
import PhoneField from "@/components/PhoneField";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; method?: string }>;
}) {
  const { error, message, method } = await searchParams;
  const byEmail = method === "email";
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">{t("تسجيل الدخول", "Sign in")}</h1>
      <p className="mb-6 text-sm text-muted">{t("ادخل بحسابك على سوداقري.", "Sign in to your Sudagri account.")}</p>

      {message && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={login} className="flex flex-col gap-4">
        <input type="hidden" name="method" value={byEmail ? "email" : "phone"} />

        {byEmail ? (
          <label className="flex flex-col gap-1 text-sm">
            {t("البريد الإلكتروني", "Email")}
            <input type="email" name="email" required className={field} />
          </label>
        ) : (
          <PhoneField autoFocus locale={locale} />
        )}

        <label className="flex flex-col gap-1 text-sm">
          {t("كلمة المرور", "Password")}
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className={field}
          />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          {t("دخول", "Sign in")}
        </button>
      </form>

      {/*
        The way out of the confirmation trap.

        Signing up by email leaves the account unconfirmed until a link is
        clicked, and someone who lost the message or tried to log in before it
        arrived was told "لم يتم تفعيل بريدك الإلكتروني بعد" with nothing on the
        page to do about it. Shown only on the email tab, because a phone
        account has no inbox and no confirmation to resend.
      */}
      {byEmail && (
        <form action={resendConfirmation} className="mt-4">
          <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted">
              {t("لم تصلك رسالة التفعيل؟", "Didn't get the confirmation message?")}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                name="email"
                required
                placeholder={t("بريدك الإلكتروني", "Your email")}
                className={field}
              />
              <button
                type="submit"
                className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary"
              >
                {t("أعد إرسال رسالة التفعيل", "Resend the confirmation message")}
              </button>
              <span className="text-xs text-muted">
                {t(
                  "تحقّق من مجلد الرسائل غير المرغوبة أيضاً — الرسالة تصل باسم مزوّد الخدمة لا باسم سوداقري.",
                  "Check your spam folder too — the message comes in the name of our service provider, not Sudagri.",
                )}
              </span>
            </div>
          </details>
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        {byEmail ? (
          <Link href="/login" className="text-primary underline">
            {t("الدخول برقم الجوال", "Sign in with a mobile number")}
          </Link>
        ) : (
          <Link href="/login?method=email" className="text-primary underline">
            {t("الدخول بالبريد الإلكتروني", "Sign in with email")}
          </Link>
        )}
      </p>

      <p className="mt-3 text-center text-sm">
        <Link href="/reset" className="text-muted underline">
          {t("نسيت كلمة المرور؟", "Forgot your password?")}
        </Link>
      </p>

      <p className="mt-6 text-sm text-muted">
        {t("ليس لديك حساب؟", "Don't have an account?")}{" "}
        <Link href="/signup" className="text-primary underline">
          {t("أنشئ حساباً جديداً", "Create a new account")}
        </Link>
      </p>
    </div>
  );
}
