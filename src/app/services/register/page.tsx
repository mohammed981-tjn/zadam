import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProviderForm from "@/components/ProviderForm";

export const metadata = { title: "تسجيل مقدّم خدمة | سودجري" };

export default async function RegisterProviderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">سجّل جهتك كمقدّم خدمة</h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        مكاتب الهندسة الزراعية، وخدمات الدرون، والري الحديث، والميكنة، والإرشاد،
        والخدمات البيطرية — سجّل جهتك لتصلك طلبات التعاقد بالمراحل.
      </p>
      <ProviderForm />
    </div>
  );
}
