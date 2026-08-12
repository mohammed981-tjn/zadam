import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OpportunityForm from "@/components/OpportunityForm";

export const metadata = {
  title: "ارفع فرصة زراعية | سودجري",
};

export default async function NewOpportunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_seasons, reporting_rate")
    .eq("id", user.id)
    .single();

  const p = profile as {
    completed_seasons: number;
    reporting_rate: number;
  } | null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">ارفع فرصة زراعية</h1>
      <p className="mb-2 mt-2 text-sm text-muted">
        املأ البيانات وستظهر لك درجة التقييم <strong>لحظياً</strong> مع سبب كل
        عامل — لتعرف بالضبط ما الذي يرفعها وما الذي يخفضها قبل أن ترفعها.
      </p>
      <p className="mb-8 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        الفرصة لا تُنشر للجمهور مباشرة. تدخل قائمة المراجعة، ولا تظهر إلا بعد
        اعتماد الإدارة واكتمال التوثيق.
      </p>
      <OpportunityForm
        operatorSeasons={p?.completed_seasons ?? 0}
        operatorReportingRate={p?.reporting_rate ?? 0}
      />
    </div>
  );
}
