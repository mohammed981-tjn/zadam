import Link from "next/link";
import { login, resendConfirmation } from "./actions";
import PhoneField from "@/components/PhoneField";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; method?: string }>;
}) {
  const { error, message, method } = await searchParams;
  const byEmail = method === "email";

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">تسجيل الدخول</h1>
      <p className="mb-6 text-sm text-muted">ادخل بحسابك على سودجري.</p>

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
            البريد الإلكتروني
            <input type="email" name="email" required className={field} />
          </label>
        ) : (
          <PhoneField autoFocus />
        )}

        <label className="flex flex-col gap-1 text-sm">
          كلمة المرور
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
          دخول
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
              لم تصلك رسالة التفعيل؟
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                name="email"
                required
                placeholder="بريدك الإلكتروني"
                className={field}
              />
              <button
                type="submit"
                className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary"
              >
                أعد إرسال رسالة التفعيل
              </button>
              <span className="text-xs text-muted">
                تحقّق من مجلد الرسائل غير المرغوبة أيضاً — الرسالة تصل باسم
                مزوّد الخدمة لا باسم سودجري.
              </span>
            </div>
          </details>
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        {byEmail ? (
          <Link href="/login" className="text-primary underline">
            الدخول برقم الجوال
          </Link>
        ) : (
          <Link href="/login?method=email" className="text-primary underline">
            الدخول بالبريد الإلكتروني
          </Link>
        )}
      </p>

      <p className="mt-3 text-center text-sm">
        <Link href="/reset" className="text-muted underline">
          نسيت كلمة المرور؟
        </Link>
      </p>

      <p className="mt-6 text-sm text-muted">
        ليس لديك حساب؟{" "}
        <Link href="/signup" className="text-primary underline">
          أنشئ حساباً جديداً
        </Link>
      </p>
    </div>
  );
}
