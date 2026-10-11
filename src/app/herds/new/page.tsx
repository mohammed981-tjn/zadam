import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HerdForm from "@/components/HerdForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "دورة إنتاج حيواني جديدة | سوداقري",
      "New livestock production cycle | Sudagri",
    ),
  };
}

export default async function NewHerdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("دورة إنتاج حيواني جديدة", "New livestock production cycle")}
      </h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        {t(
          "أدخل النوع والغرض والعدد وتاريخ البدء، وسيولّد النظام مراحل الدورة بتواريخها وتقدير العلف لكل مرحلة وحصتها من الميزانية.",
          "Enter the species, purpose, number of head and start date, and the system will generate the cycle's stages with their dates, the feed estimate for each stage and its share of the budget.",
        )}
      </p>
      <HerdForm
        today={new Date().toISOString().slice(0, 10)}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
