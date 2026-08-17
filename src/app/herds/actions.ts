"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planHerd } from "@/lib/livestock";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Creates a herd and its phase plan together.
 *
 * Mirrors createSeason deliberately, down to deleting the herd if the phases
 * fail to save: a herd with no plan is worse than no herd, because it looks
 * like a running cycle and has nothing scheduled underneath it.
 */
export async function createHerd(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  if (!name) return { ok: false, message: "اسم الدورة مطلوب." };

  const plan = planHerd(
    str(formData, "species"),
    str(formData, "purpose"),
    num(formData, "head_count"),
    str(formData, "start_date"),
    num(formData, "budget_per_head"),
  );

  if (!plan) {
    return {
      ok: false,
      message: "تعذّر توليد خطة الدورة — راجع النوع والغرض والعدد وتاريخ البدء.",
    };
  }

  const { data: herd, error: herdError } = await supabase
    .from("herds")
    .insert({
      owner_id: user.id,
      project_id: str(formData, "project_id") || null,
      name,
      species: plan.species.key,
      breed: str(formData, "breed") || null,
      head_count: plan.headCount,
      purpose: plan.purpose,
      start_date: plan.startDate,
      end_date: plan.endDate,
    })
    .select("id")
    .single();

  if (herdError || !herd) {
    return { ok: false, message: `تعذّر إنشاء الدورة: ${herdError?.message}` };
  }

  const herdId = (herd as { id: string }).id;

  const { error: stagesError } = await supabase.from("herd_stages").insert(
    plan.stages.map((s) => ({
      herd_id: herdId,
      stage_key: s.key,
      stage_order: s.order,
      planned_start: s.startDate,
      planned_end: s.endDate,
      planned_feed_kg: s.feedKg,
      budget: s.budget,
    })),
  );

  if (stagesError) {
    await supabase.from("herds").delete().eq("id", herdId);
    return { ok: false, message: `تعذّر حفظ مراحل الدورة: ${stagesError.message}` };
  }

  redirect(`/herds/${herdId}`);
}

/**
 * Closes a phase. The database refuses if an earlier one is still open, and its
 * message is passed back untouched because it is written for the operator.
 */
export async function completeHerdStage(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");

  const { error } = await supabase
    .from("herd_stages")
    .update({
      completed: true,
      actual_end: new Date().toISOString().slice(0, 10),
    })
    .eq("id", str(formData, "stage_id"));

  revalidatePath(`/herds/${herdId}`);

  if (error) {
    redirect(`/herds/${herdId}?error=${encodeURIComponent(error.message)}`);
  }
}
