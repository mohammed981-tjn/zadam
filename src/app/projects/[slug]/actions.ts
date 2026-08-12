"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INVESTMENT_LIVE } from "@/lib/config";

export async function invest(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const shares = Number(formData.get("shares") ?? 0);
  const pricePerShare = Number(formData.get("price_per_share") ?? 0);

  // Server-side gate: the platform does not accept money yet, and refusing here
  // (not just hiding the button) is what actually stops a forged request.
  if (!INVESTMENT_LIVE) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "الاستثمار غير مفتوح بعد. سجّل اهتمامك وسنبلغك فور إتاحته.",
      )}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent("سجّل الدخول أولاً للاستثمار")}`,
    );
  }

  if (!Number.isFinite(shares) || shares < 1) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent("عدد الحصص غير صالح")}`,
    );
  }

  // A sample project can never take a real investment, whatever the stage flag.
  const { data: project } = await supabase
    .from("projects")
    .select("is_demo")
    .eq("id", projectId)
    .single();

  if (!project || (project as { is_demo: boolean }).is_demo) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "هذا نموذج توضيحي وليس فرصة استثمار حقيقية.",
      )}`,
    );
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
