import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import PlanForm from "@/components/PlanForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(loginTo("/plan"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("تخطيط الاستثمار", "Investment planning")}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        {t(
          "أجب عن الأسئلة التالية وأدخل المبلغ الذي تريد استثماره، وسيقترح النظام توزيعاً بين المشاريع المفتوحة حالياً بناءً على مستوى تحمّلك للمخاطرة — توزيع آلي يعتمد على مستوى مخاطرة كل مشروع والحصص المتاحة فعلياً فيه، وليس توصية مالية شخصية.",
          "Answer the questions below and enter the amount you want to invest, and the system will suggest a split across the projects open right now based on how much risk you can take — an automatic split based on each project's risk level and the shares actually available in it, not personal financial advice.",
        )}
      </p>
      <div className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        {t("المشاريع المستخدمة في الحساب", "The projects used in this calculation are")}{" "}
        <strong className="font-bold">{t("نماذج توضيحية", "illustrative examples")}</strong>{" "}
        {t(
          "حالياً، والاستثمار لم يُفتح بعد. الأداة تُظهر كيف سيوزّع النظام المبلغ فعلياً عند إطلاق المشاريع الحقيقية.",
          "for now, and investment is not open yet. The tool shows how the system will actually split the amount once real projects launch.",
        )}
      </div>
      <PlanForm />
    </div>
  );
}
