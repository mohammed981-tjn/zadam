import Link from "next/link";
import { signup } from "../login/actions";
import PhoneField from "@/components/PhoneField";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string }>;
}) {
  const { error, method } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

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
      <h1 className="mb-2 text-2xl font-bold">{t("إنشاء حساب", "Create an account")}</h1>
      <p className="mb-6 text-sm text-muted">
        {phoneSignupAvailable
          ? t("سجّل برقم جوالك — لا حاجة لبريد إلكتروني.", "Sign up with your mobile number — no email needed.")
          : t("سجّل ببريدك الإلكتروني.", "Sign up with your email.")}
      </p>

      {!phoneSignupAvailable && (
        <p className="mb-4 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted">
          {t(
            "التسجيل برقم الجوال غير متاح على هذه النسخة من الموقع. التسجيل بالبريد الإلكتروني يعمل بشكل طبيعي، والحساب واحد في الحالتين.",
            "Signing up with a mobile number is not available on this version of the site. Signing up by email works normally, and it is the same account either way.",
          )}
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
          {t("الاسم الكامل", "Full name")}
          <input type="text" name="full_name" required className={field} />
        </label>

        {/*
          السؤالُ الذي لم يكن يُسأل.

          Every account ever created was written as an investor, because
          `handle_new_user` hard-coded it and nothing asked. A platform whose
          spine is land, seasons and a farm passport was telling every single
          person who joined that they had come to invest.

          The choice decides the doorway after signing in and what the menu
          leads with — nothing more. It grants no permission either way, it is
          changeable later from the same form's server action, and the boundary
          on everything that matters is ownership, not this.
        */}
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">{t("وأنت؟", "And you?")}</legend>
          <label className="flex items-start gap-2 rounded-lg border border-border p-3">
            <input
              type="radio"
              name="role"
              value="farmer"
              defaultChecked
              className="mt-1"
            />
            <span>
              <strong>{t("أزرع", "I farm")}</strong>
              <span className="block text-xs text-muted">
                {t(
                  "أسجّل أرضي وأوثّق مواسمي، ويتكوّن لمزرعتي سجلٌّ يقرأه المشتري.",
                  "I register my land and record my seasons, and my farm builds up a record that buyers can read.",
                )}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-border p-3">
            <input type="radio" name="role" value="investor" className="mt-1" />
            <span>
              <strong>{t("أستثمر", "I invest")}</strong>
              <span className="block text-xs text-muted">
                {t(
                  "أتابع المشاريع المطروحة. والاستثمارُ لم يُفتح بعد — لا يُعرض مشروعٌ قبل توثيقه ومعاينته.",
                  "I follow the projects on offer. Investment is not open yet — no project is listed before it has been documented and inspected.",
                )}
              </span>
            </span>
          </label>
        </fieldset>

        {byEmail ? (
          <label className="flex flex-col gap-1 text-sm">
            {t("البريد الإلكتروني", "Email")}
            <input type="email" name="email" required className={field} />
            <span className="text-xs text-muted">
              {t(
                "إن وصلتك رسالة تفعيل فستكون باسم خدمة الاستضافة (Supabase) لا باسم سوداقري — هذا طبيعي وليست رسالة احتيال. افتحها واضغط الرابط.",
                "If you get a confirmation message, it will come in the name of our hosting provider (Supabase), not Sudagri — this is normal and not a scam. Open it and click the link.",
              )}
            </span>
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
            minLength={6}
            autoComplete="new-password"
            className={field}
          />
          <span className="text-xs text-muted">{t("ستة أحرف على الأقل.", "At least six characters.")}</span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          {t("إنشاء الحساب", "Create account")}
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
              {t("التسجيل برقم الجوال بدلاً من ذلك", "Sign up with a mobile number instead")}
            </Link>
          ) : (
            <Link href="/signup?method=email" className="text-primary underline">
              {t("التسجيل بالبريد الإلكتروني بدلاً من ذلك", "Sign up with email instead")}
            </Link>
          )}
        </p>
      )}

      <p className="mt-6 text-sm text-muted">
        {t("لديك حساب بالفعل؟", "Already have an account?")}{" "}
        <Link href="/login" className="text-primary underline">
          {t("سجّل الدخول", "Sign in")}
        </Link>
      </p>
    </div>
  );
}
