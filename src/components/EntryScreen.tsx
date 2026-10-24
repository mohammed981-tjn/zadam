import AuthForm from "@/components/AuthForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/** The screen itself, shared with /signup. */
export default async function EntryScreen({
  next,
  error,
  message,
  startNew,
  investor = false,
}: {
  next: string | null;
  error?: string;
  message?: string;
  startNew: boolean;
  /** Came from an opportunity: «أستثمر» chosen, and said so. */
  investor?: boolean;
}) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // Whether this deployment can create a phone account — only whether the key
  // exists; no admin call is made while rendering a public page.
  const phoneSignup = createAdminClient() !== null;

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">
        {investor
          ? t("حساب المستثمر", "Your investor account")
          : startNew
            ? t("أنشئ حسابك", "Create your account")
            : t("ادخل إلى سوداقري", "Sign in to Sudagri")}
      </h1>
      {investor && (
        <p className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-6">
          {t(
            "حسابٌ واحد برقم جوالك أو بريدك، ثمّ تعود إلى الفرصة نفسها وتطلب الشراكة من صاحب الأرض. لا تدفع شيئاً للمنصّة لتسجّل.",
            "One account with your mobile number or email, then you come back to the same opportunity and ask the landowner for a partnership. Signing up costs nothing.",
          )}
        </p>
      )}
      <p className="mb-6 text-sm text-muted">
        {t(
          "برقم جوالك أو بريدك، في الشاشة نفسها. وإن لم يكن لك حساب أنشأناه لك هنا.",
          "With your mobile number or email, on this one screen. If you have no account, we create it here.",
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

      <AuthForm next={next} startNew={startNew} startRole={investor ? "investor" : "farmer"} phoneSignup={phoneSignup} />
    </div>
  );
}
