import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { completePasswordReset } from "@/app/login/actions";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "كلمة مرور جديدة | سوداقري", "New password | Sudagri") };
}

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  /*
   * The link from the email carries a recovery token, which the Supabase
   * middleware exchanges for a session before this page renders. So the
   * question "is this link still good?" is answered by asking whether there is
   * a user — and it is asked here, on arrival, rather than after someone has
   * typed a new password twice and pressed the button.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  if (!user) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="mb-2 text-2xl font-bold">{t("الرابط لم يعد صالحاً", "This link is no longer valid")}</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {t(
            "رابط إعادة التعيين صالح لفترة قصيرة ولمرة واحدة، ويبدو أنه انتهى أو استُخدم من قبل. اطلب رابطاً جديداً.",
            "A reset link works once and only for a short time, and this one seems to have expired or already been used. Request a new one.",
          )}
        </p>
        <Link
          href="/reset"
          className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          {t("اطلب رابطاً جديداً", "Request a new link")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">{t("كلمة مرور جديدة", "New password")}</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        {t(
          "اختر كلمة مرور جديدة لحسابك. لن تحتاج الرابط بعدها.",
          "Choose a new password for your account. You won't need the link after this.",
        )}
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={completePasswordReset} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("كلمة المرور الجديدة", "New password")}
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("أعد كتابتها", "Type it again")}
          <input
            type="password"
            name="confirm"
            required
            minLength={6}
            autoComplete="new-password"
            className={field}
          />
          <span className="text-xs text-muted">
            {t(
              "٦ أحرف على الأقل. تُكتب مرتين لأن خطأً مطبعياً هنا يقفل الحساب على صاحبه.",
              "At least 6 characters. Typed twice because a typo here locks the owner out of the account.",
            )}
          </span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground"
        >
          {t("احفظ كلمة المرور", "Save password")}
        </button>
      </form>
    </div>
  );
}
