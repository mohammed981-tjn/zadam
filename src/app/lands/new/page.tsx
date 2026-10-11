import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandForm from "@/components/LandForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "سجّل أرضك | سوداقري", "Register your land | Sudagri") };
}

export default async function NewLandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("سجّل أرضك", "Register your land")}
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "صِف أرضك مرة واحدة، وستُبنى عليها مواسمك وفرصك الاستثمارية بعد ذلك دون إعادة إدخال. وأثناء إدخال بيانات المياه سيخبرك النظام فوراً أي المحاصيل تكفيها مياهك فعلاً.",
          "Describe your land once, and your seasons and investment opportunities will be built on it from then on without re-entering anything. As you enter the water details, the system tells you straight away which crops your water can actually support.",
        )}
      </p>
      <LandForm />
    </div>
  );
}
