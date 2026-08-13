import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandForm from "@/components/LandForm";

export const metadata = { title: "سجّل أرضك | سودجري" };

export default async function NewLandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">سجّل أرضك</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        صِف أرضك مرة واحدة، وستُبنى عليها مواسمك وفرصك الاستثمارية بعد ذلك دون
        إعادة إدخال. وأثناء إدخال بيانات المياه سيخبرك النظام فوراً أي المحاصيل
        تكفيها مياهك فعلاً.
      </p>
      <LandForm />
    </div>
  );
}
