import Link from "next/link";
import { requestPasswordReset, requestPhoneReset } from "@/app/login/actions";
import PhoneField from "@/components/PhoneField";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "إعادة تعيين كلمة المرور | سوداقري", "Reset your password | Sudagri"),
  };
}

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">{t("نسيت كلمة المرور", "Forgot your password")}</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        {t(
          "أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.",
          "Enter your email and we will send you a link to set a new password.",
        )}
      </p>

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

      <form action={requestPasswordReset} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("البريد الإلكتروني", "Email")}
          <input type="email" name="email" required className={field} />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground"
        >
          {t("أرسل رابط إعادة التعيين", "Send reset link")}
        </button>
      </form>

      {/*
        Said here rather than discovered by a phone user pressing the button and
        getting nothing. Their number is folded into an internal address that
        reaches no inbox, so there is genuinely nowhere to send a link until
        there is an SMS route — and a form that appears to work while doing
        nothing is worse than one that admits its limit.
      */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4 text-xs leading-relaxed text-muted">
        <p className="mb-1 font-medium text-foreground">
          {t("سجّلت برقم جوالك؟", "Signed up with your mobile number?")}
        </p>
        <p>
          {t(
            "الرقم لا يستقبل بريداً، فتستعيدها الإدارة لك: اكتب رقمك واسمك، فتتّصل بك على الرقم نفسه لتتأكّد أنّك صاحبه، ثمّ تقرأ لك كلمة مرورٍ مؤقّتة تدخل بها وتضع كلمتك.",
            "A number cannot receive email, so the administration restores it for you: enter your number and name, and they will call that same number to make sure it is yours, then read you a temporary password to sign in with and set your own.",
          )}
        </p>
        {/* AUTH-05 (backlog 141): the request goes to the administration; nothing here says whether the number has an account. */}
        <form action={requestPhoneReset} className="mt-4 flex flex-col gap-3 text-sm text-foreground">
          <PhoneField locale={locale} />
          <label className="flex flex-col gap-1">
            {t("اسمك كما في حسابك", "Your name as on your account")}
            <input name="full_name" required minLength={2} maxLength={120} className={field} />
          </label>
          <button type="submit" className="rounded-lg border border-primary px-4 py-2 font-medium text-primary">
            {t("اطلب الاستعادة من الإدارة", "Ask the administration to restore it")}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary underline">
          {t("عودة لتسجيل الدخول", "Back to sign in")}
        </Link>
      </p>
    </div>
  );
}
