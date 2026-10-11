import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeasonForm from "@/components/SeasonForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "موسم جديد | سوداقري", "New season | Sudagri") };
}

export default async function NewSeasonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // Projects the season can be attached to. RLS already limits this to what the
  // user may see, so no owner filter is needed here — draft projects belonging
  // to others simply do not come back.
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("موسم زراعي جديد", "New growing season")}
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "أدخل محصولك ومنطقتك وتاريخ زراعتك، وسيولّد النظام خطة المراحل بتواريخها واحتياج كل مرحلة من الماء وحصتها من الميزانية — محسوبة لا مكتوبة.",
          "Enter your crop, your zone and your planting date, and the system will generate the stage plan with its dates, each stage's water need and its share of the budget — calculated, not typed in.",
        )}
      </p>
      <SeasonForm
        today={new Date().toISOString().slice(0, 10)}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
