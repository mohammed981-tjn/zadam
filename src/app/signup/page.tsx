import Link from "next/link";
import { signup } from "../login/actions";
import PhoneField from "@/components/PhoneField";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string }>;
}) {
  const { error, method } = await searchParams;

  /*
   * Can this deployment actually create a phone account?
   *
   * Registering by phone needs the service role key: the number is folded into
   * an internal address that can receive no confirmation link, so the account
   * has to be created already confirmed through the admin API. Without the key
   * that is impossible, and the old behaviour was to let someone type their
   * name, their number and a password, press the button, and only then be told
   * the server was not configured for it.
   *
   * Checked here instead, before a single field is filled. The check is only
   * for whether the key exists — no admin call is made while rendering a public
   * page.
   */
  const phoneSignupAvailable = createAdminClient() !== null;

  // A visitor who asked for the email form gets it; one who did not is put on
  // the phone form unless this deployment cannot serve it.
  const byEmail = method === "email" || !phoneSignupAvailable;

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">إنشاء حساب</h1>
      <p className="mb-6 text-sm text-muted">
        {phoneSignupAvailable
          ? "سجّل برقم جوالك — لا حاجة لبريد إلكتروني."
          : "سجّل ببريدك الإلكتروني."}
      </p>

      {!phoneSignupAvailable && (
        <p className="mb-4 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted">
          التسجيل برقم الجوال غير متاح على هذه النسخة من الموقع. التسجيل بالبريد
          الإلكتروني يعمل بشكل طبيعي، والحساب واحد في الحالتين.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <input type="hidden" name="method" value={byEmail ? "email" : "phone"} />

        <label className="flex flex-col gap-1 text-sm">
          الاسم الكامل
          <input type="text" name="full_name" required className={field} />
        </label>

        {byEmail ? (
          <label className="flex flex-col gap-1 text-sm">
            البريد الإلكتروني
            <input type="email" name="email" required className={field} />
            <span className="text-xs text-muted">
              إن وصلتك رسالة تفعيل فستكون باسم خدمة الاستضافة (Supabase) لا باسم
              سودجري — هذا طبيعي وليست رسالة احتيال. افتحها واضغط الرابط.
            </span>
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
            minLength={6}
            autoComplete="new-password"
            className={field}
          />
          <span className="text-xs text-muted">ستة أحرف على الأقل.</span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          إنشاء الحساب
        </button>
      </form>

      {/*
        The switch is hidden rather than disabled when phone signup cannot work
        here. A link that leads to a form which always fails is worse than no
        link — it costs the visitor the effort of finding out.
      */}
      {phoneSignupAvailable && (
        <p className="mt-4 text-center text-sm">
          {byEmail ? (
            <Link href="/signup" className="text-primary underline">
              التسجيل برقم الجوال بدلاً من ذلك
            </Link>
          ) : (
            <Link href="/signup?method=email" className="text-primary underline">
              التسجيل بالبريد الإلكتروني بدلاً من ذلك
            </Link>
          )}
        </p>
      )}

      <p className="mt-6 text-sm text-muted">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="text-primary underline">
          سجّل الدخول
        </Link>
      </p>
    </div>
  );
}
