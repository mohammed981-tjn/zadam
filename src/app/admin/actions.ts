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

  await supabase.from("projects").update({ status }).eq("id", projectId);

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
    redirect(`/admin/projects/${projectId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

export async function confirmInvestment(formData: FormData) {
  const { supabase } = await requireAdmin();
  const investmentId = String(formData.get("investment_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const shares = Number(formData.get("shares") ?? 0);

  await supabase.from("investments").update({ status: "confirmed" }).eq("id", investmentId);

  const { data: project } = await supabase
    .from("projects")
    .select("shares_sold")
    .eq("id", projectId)
    .single();

  if (project) {
    await supabase
      .from("projects")
      .update({ shares_sold: project.shares_sold + shares })
      .eq("id", projectId);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}
