import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { MIN_PASSWORD } from "@/lib/authEntry";
import { changeOwnPassword } from "@/app/login/actions";
import { button, field, label } from "@/lib/ui";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "غيّر كلمة مرورك | سوداقري", "Change your password | Sudagri") };
}

/**
 * «غيّر كلمة مرورك» (AUTH-05، البند ١٤١). لأيّ حسابٍ داخل؛ ومن دخل بكلمةٍ مؤقّتة أعطته الإدارة يُرسَل إلى هنا قبل
 * أيّ صفحة (lib/supabase/middleware.ts)، لأنّ المدير يعرفها.
 */
export default async function ChangePasswordPage({ searchParams }: PageProps<"/account/password">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/password");
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const forced = user.user_metadata?.must_change_password === true;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">{t("غيّر كلمة مرورك", "Change your password")}</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        {forced
          ? t(
              "دخلت بكلمة مرورٍ مؤقّتة قرأتها لك الإدارة. ضع كلمتك أنت الآن؛ لا تُفتح صفحةٌ أخرى قبل ذلك.",
              "You signed in with a temporary password the administration read to you. Set your own now; no other page opens before you do.",
            )
          : t("اختر كلمة مرورٍ جديدة لحسابك.", "Choose a new password for your account.")}
      </p>
      {typeof sp.error === "string" && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>
      )}
      <form action={changeOwnPassword} className="flex flex-col gap-4">
        <label className={label}>
          {t(`كلمة المرور الجديدة (${MIN_PASSWORD} أحرف على الأقلّ)`, `New password (at least ${MIN_PASSWORD} characters)`)}
          <input type="password" name="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={field} />
        </label>
        <label className={label}>
          {t("أعد كتابتها", "Type it again")}
          <input type="password" name="confirm" required minLength={MIN_PASSWORD} autoComplete="new-password" className={field} />
        </label>
        <button className={button}>{t("احفظها", "Save it")}</button>
      </form>
    </div>
  );
}
