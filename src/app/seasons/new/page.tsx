import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeasonForm from "@/components/SeasonForm";

export const metadata = { title: "موسم جديد | سودجري" };

export default async function NewSeasonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">موسم زراعي جديد</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        أدخل محصولك ومنطقتك وتاريخ زراعتك، وسيولّد النظام خطة المراحل بتواريخها
        واحتياج كل مرحلة من الماء وحصتها من الميزانية — محسوبة لا مكتوبة.
      </p>
      <SeasonForm today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
