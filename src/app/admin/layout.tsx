import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { adminState } from "@/lib/adminGuard";
import PageHeader from "@/components/PageHeader";
import SecondFactor from "@/components/SecondFactor";
import { card } from "@/lib/ui";

/**
 * بوّابة صفحات الإدارة (AUTH-04، البند ١٤١): مديرٌ دخل بكلمة المرور وحدها يُطلب منه الرمز الثاني هنا قبل أن يرى شيئاً،
 * أو يربط تطبيق المصادقة إن لم يربطه بعد. هذا لراحة المدير لا للحماية: القاعدة نفسها لا تعامله مديراً بلا الرمز
 * (`is_admin()`)، فلا تُرجع له ما للإدارة ولو طلبه من غير هذه الصفحات.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Each page sends a visitor to sign in, and someone who is not an administrator away; the layout leaves that to them.
  if (!user || (await adminState(supabase, user.id)) !== "needs_second_factor") return children;

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const linked = (factors?.totp ?? []).some((f) => f.status === "verified");

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("الرمز الثاني", "The second code")}>
        {linked
          ? t(
              "اكتب الرقم الظاهر الآن في تطبيق المصادقة على هاتفك. صفحات الإدارة لا تعمل بكلمة المرور وحدها.",
              "Enter the code showing now in the authenticator app on your phone. The administration pages do not work with the password alone.",
            )
          : t(
              "صفحات الإدارة لا تعمل بكلمة المرور وحدها: يلزم رقمٌ من تطبيق مصادقة على هاتفك يتغيّر كلّ ثلاثين ثانية. تربطه مرّةً واحدة الآن، ثمّ تكتب رقمه عند كلّ دخول.",
              "The administration pages do not work with the password alone: they need a code from an authenticator app on your phone that changes every thirty seconds. Link it once now, then enter its code each time you sign in.",
            )}
      </PageHeader>
      <section className={`${card} mt-6`}>
        {!linked && (
          <p className="mb-4 text-sm leading-7 text-muted">
            {t(
              "نزّل «Google Authenticator» أو «Microsoft Authenticator» من متجر هاتفك (مجّانيّ)، ثمّ اضغط الزرّ.",
              "Install «Google Authenticator» or «Microsoft Authenticator» from your phone's store (free), then press the button.",
            )}
          </p>
        )}
        <SecondFactor mode={linked ? "verify" : "enroll"} />
      </section>
      <p className="mt-4 text-xs leading-6 text-muted">
        {t(
          "إن ضاع الهاتف: يوقف المالك هذا الشرط من محرّر SQL في لوحة Supabase بسطرٍ واحد (في ملفّ الهجرة 20261026040000)، ثمّ يربط هاتفاً جديداً ويعيده.",
          "If the phone is lost: the owner switches this off from the SQL editor in the Supabase dashboard with one line (in migration 20261026040000), links a new phone, and switches it back on.",
        )}
      </p>
    </div>
  );
}
