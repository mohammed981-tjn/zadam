"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function invest(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const shares = Number(formData.get("shares") ?? 0);
  const pricePerShare = Number(formData.get("price_per_share") ?? 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("سجّل الدخول أولاً للاستثمار")}`);
  }

  if (!Number.isFinite(shares) || shares < 1) {
    redirect(`/projects/${slug}?error=${encodeURIComponent("عدد الحصص غير صالح")}`);
  }

  const { error } = await supabase.from("investments").insert({
    project_id: projectId,
    investor_id: user.id,
    shares,
    amount: shares * pricePerShare,
    status: "pending",
  });

  if (error) {
    redirect(`/projects/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard?invested=1");
}
