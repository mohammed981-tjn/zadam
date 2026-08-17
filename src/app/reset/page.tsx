import Link from "next/link";
import { requestPasswordReset } from "@/app/login/actions";

export const metadata = { title: "إعادة تعيين كلمة المرور | سودجري" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">نسيت كلمة المرور</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.
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
          البريد الإلكتروني
          <input type="email" name="email" required className={field} />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground"
        >
          أرسل رابط إعادة التعيين
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
          سجّلت برقم جوالك؟
        </p>
        <p>
          إعادة التعيين بالبريد لا تصلح للحسابات المسجّلة بالجوال، لأن الرقم لا
          يستقبل بريداً. تواصل معنا وسنعيد تعيينها لك يدوياً — إلى أن تتوفّر
          خدمة الرسائل القصيرة.
        </p>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary underline">
          عودة لتسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
