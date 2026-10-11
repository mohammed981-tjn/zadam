import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProviderForm from "@/components/ProviderForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "تسجيل مقدّم خدمة | سوداقري", "Register as a service provider | Sudagri"),
  };
}

export default async function RegisterProviderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("سجّل جهتك كمقدّم خدمة", "Register your organisation as a service provider")}
      </h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        {t(
          "مكاتب الهندسة الزراعية، وخدمات الدرون، والري الحديث، والميكنة، والإرشاد، والخدمات البيطرية — سجّل جهتك لتصلك طلبات التعاقد بالمراحل.",
          "Agricultural engineering offices, drone services, modern irrigation, mechanisation, extension and veterinary services — register your organisation to receive phased contract requests.",
        )}
      </p>
      <ProviderForm />
    </div>
  );
}
