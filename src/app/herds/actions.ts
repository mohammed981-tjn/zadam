"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planHerd, apportionBudget } from "@/lib/livestock";

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
    await supabase
      .from("herds")
      .delete()
      .eq("id", herdId)
      .then(({ error: rollbackError }) => {
        if (rollbackError) {
          console.error("herd rollback failed — orphan left behind", {
            herdId,
            rollbackError,
          });
        }
      });
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

/**
 * يضبط ميزانيّةَ الرأس بعد الإنشاء — وكان لا سبيلَ إليها إطلاقاً.
 *
 * WHAT WAS WRONG
 *
 * «الميزانية للرأس» is an optional field on the creation form with no default.
 * Left blank it reads as `Number("") === 0`, `planHerd` apportions zero across
 * every phase, and the herd screen then shows «الميزانية 0» beside each phase's
 * «· 0» for the life of the cycle. The feed figure is computed correctly beside
 * it, which makes the zeros look like a broken calculation rather than a blank
 * field — the owner of this platform read them exactly that way.
 *
 * And the module had **no edit path at all**: `createHerd` and
 * `completeHerdStage`, nothing else. A herd created with that field empty could
 * not be corrected, only abandoned — and there is no delete either.
 *
 * WHY IT REBUILDS THE SPLIT INSTEAD OF STORING A PER-HEAD FIGURE
 *
 * `herds` has no `budget_per_head` column; the number exists only as the
 * apportioned `budget` on each phase. So the edit re-derives the same split
 * `planHerd` would have produced, through the same `apportionBudget` — one
 * rule, one implementation, and the phases still sum to the whole.
 *
 * WHY DATES AND FEED ARE NOT TOUCHED
 *
 * Money is a plan and can be revised; the schedule and the feed estimate are
 * what the cycle has been run against, and a phase may already be closed. Re-
 * planning those would rewrite history to fix a typo.
 */
export async function setHerdBudget(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");
  const perHead = num(formData, "budget_per_head");

  if (!herdId) return;
  if (!Number.isFinite(perHead) || perHead < 0) {
    redirect(
      `/herds/${herdId}?error=${encodeURIComponent("الميزانية للرأس رقمٌ موجب.")}`,
    );
  }

  const { data: herdRow } = await supabase
    .from("herds")
    .select("head_count")
    .eq("id", herdId)
    .single();

  if (!herdRow) {
    redirect(
      `/herds/${herdId}?error=${encodeURIComponent("الدورة غير موجودة أو ليست لك.")}`,
    );
  }

  const { data: stageRows } = await supabase
    .from("herd_stages")
    .select("id, planned_feed_kg, stage_order")
    .eq("herd_id", herdId)
    .order("stage_order");

  const stages = (stageRows ?? []) as {
    id: string;
    planned_feed_kg: number | null;
    stage_order: number;
  }[];

  if (stages.length === 0) {
    redirect(
      `/herds/${herdId}?error=${encodeURIComponent("لا مراحلَ لهذه الدورة.")}`,
    );
  }

  const headCount = Number((herdRow as { head_count: number }).head_count);
  const budgets = apportionBudget(
    stages.map((s) => Number(s.planned_feed_kg ?? 0)),
    perHead * headCount,
  );

  for (let i = 0; i < stages.length; i++) {
    const { data, error } = await supabase
      .from("herd_stages")
      .update({ budget: budgets[i] })
      .eq("id", stages[i].id)
      .select("id");

    if (error) {
      redirect(`/herds/${herdId}?error=${encodeURIComponent(error.message)}`);
    }
    // ورفضُ سياسة الصفوف لا يرفع خطأً ولا يمسّ صفّاً، فيُقرأ نجاحاً.
    if ((data ?? []).length === 0) {
      redirect(
        `/herds/${herdId}?error=${encodeURIComponent("لم تتغيّر الميزانية — الدورة ليست لك.")}`,
      );
    }
  }

  revalidatePath(`/herds/${herdId}`);
  redirect(`/herds/${herdId}`);
}
