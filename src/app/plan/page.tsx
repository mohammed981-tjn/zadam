import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlanForm from "@/components/PlanForm";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">تخطيط الاستثمار</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        أجب عن الأسئلة التالية وأدخل المبلغ الذي تريد استثماره، وسيقترح النظام
        توزيعاً بين المشاريع المفتوحة حالياً بناءً على مستوى تحمّلك للمخاطرة —
        توزيع آلي يعتمد على مستوى مخاطرة كل مشروع والحصص المتاحة فعلياً فيه،
        وليس توصية مالية شخصية.
      </p>
      <div className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        المشاريع المستخدمة في الحساب{" "}
        <strong className="font-bold">نماذج توضيحية</strong> حالياً، والاستثمار
        لم يُفتح بعد. الأداة تُظهر كيف سيوزّع النظام المبلغ فعلياً عند إطلاق
        المشاريع الحقيقية.
      </div>
      <PlanForm />
    </div>
  );
}
