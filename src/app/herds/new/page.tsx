import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HerdForm from "@/components/HerdForm";

export const metadata = { title: "دورة إنتاج حيواني جديدة | سودجري" };

export default async function NewHerdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">دورة إنتاج حيواني جديدة</h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        أدخل النوع والغرض والعدد وتاريخ البدء، وسيولّد النظام مراحل الدورة
        بتواريخها وتقدير العلف لكل مرحلة وحصتها من الميزانية.
      </p>
      <HerdForm
        today={new Date().toISOString().slice(0, 10)}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
