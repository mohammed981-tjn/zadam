"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  return { supabase, user };
}

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const name = String(formData.get("name") ?? "");
  const { error } = await supabase.from("projects").insert({
    slug: slugify(name),
    name,
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
    total_feddans: Number(formData.get("total_feddans") ?? 0),
    price_per_share: Number(formData.get("price_per_share") ?? 0),
    total_shares: Number(formData.get("total_shares") ?? 0),
    status: String(formData.get("status") ?? "draft"),
    risk_level: String(formData.get("risk_level") ?? "medium"),
    expected_annual_return: formData.get("expected_annual_return")
      ? Number(formData.get("expected_annual_return"))
      : null,
    created_by: user.id,
  });

  if (error) {
    redirect(`/admin/projects/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateProjectStatus(formData: FormData) {
  const { supabase } = await requireAdmin();

  const projectId = String(formData.get("project_id") ?? "");
  const status = String(formData.get("status") ?? "");

  /*
   * .select() so the result says whether a row actually changed.
   *
   * An UPDATE that RLS filters out returns no error and no rows. Without this
   * the admin is redirected to a success page whether the status moved or the
   * database refused — and a policy that starts refusing would never be
   * noticed.
   */
  const { data: updated, error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId)
    .select("id");

  if (error) {
    console.error("updateProjectStatus failed", error);
    redirect(
      `/admin/projects/${projectId}?error=${encodeURIComponent(
        "تعذّر تحديث حالة المشروع.",
      )}`,
    );
  }

  if (!updated || updated.length === 0) {
    console.error("updateProjectStatus: no row updated", { projectId });
    redirect(
      `/admin/projects/${projectId}?error=${encodeURIComponent(
        "لم يتغيّر شيء — المشروع غير موجود أو لا تملك صلاحية تعديله.",
      )}`,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin");
  redirect("/admin");
}

export async function addProjectUpdate(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const projectId = String(formData.get("project_id") ?? "");
  const { error } = await supabase.from("project_updates").insert({
    project_id: projectId,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    created_by: user.id,
  });

  if (error) {
    // Logged in full; the browser gets a fixed string. PostgREST messages name
    // tables, columns, constraints and the policy that refused.
    console.error("addProjectUpdate failed", error);
    redirect(
      `/admin/projects/${projectId}?error=${encodeURIComponent(
        "تعذّر نشر التقرير.",
      )}`,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

export async function confirmInvestment(formData: FormData) {
  const { supabase } = await requireAdmin();
  const investmentId = String(formData.get("investment_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");

  /*
   * The result was discarded, so every way this can fail looked like success.
   *
   * The function raises distinct conditions and each one matters to the person
   * clicking: 42501 not an administrator, 55000 the investment is no longer
   * pending, 23514 the project has fewer shares left than the investment asks
   * for, 40001 another confirmation won the race. Telling an admin "confirmed"
   * when the database refused is how a share ledger and a spreadsheet drift
   * apart without anyone noticing.
   */
  const { error } = await supabase.rpc("confirm_investment", {
    p_investment_id: investmentId,
  });

  if (error) {
    console.error("confirm_investment failed", { investmentId, error });
    redirect(
      `/admin/projects/${projectId}?error=${encodeURIComponent(
        "تعذّر تأكيد الاستثمار. راجع سجل الخادم للسبب.",
      )}`,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}
