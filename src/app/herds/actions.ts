"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import {
  addHerdHealthRecord,
  addHerdTagRange,
  completeHerdStageStep,
  createHerdWithPlan,
  setHerdBudgetStep,
} from "@/lib/herdSteps";
import { dbText } from "@/lib/dbText";
import { getLocale } from "@/lib/locale";

/*
 * Every step here is shared with the phone app's herds screen (backlog 203): the work is in src/lib/herdSteps.ts,
 * and these actions carry the form there and turn the answer into the page to show.
 */

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
  if (!user) redirect(await loginHrefHere());

  const result = await createHerdWithPlan(
    supabase,
    user.id,
    {
      name: str(formData, "name"),
      species: str(formData, "species"),
      purpose: str(formData, "purpose"),
      headCount: num(formData, "head_count"),
      startDate: str(formData, "start_date"),
      budgetPerHead: num(formData, "budget_per_head"),
      breed: str(formData, "breed"),
      projectId: str(formData, "project_id"),
    },
    await getLocale(),
  );
  if (!result.ok) return { ok: false, message: result.message };
  redirect(`/herds/${result.id}`);
}

/**
 * Closes a phase. The database refuses if an earlier one is still open, and its
 * message is passed back untouched because it is written for the operator.
 */
export async function completeHerdStage(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");

  const error = await completeHerdStageStep(supabase, str(formData, "stage_id"), await getLocale());

  revalidatePath(`/herds/${herdId}`);

  if (error) {
    redirect(`/herds/${herdId}?error=${encodeURIComponent(error)}`);
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
  if (!herdId) return;

  const error = await setHerdBudgetStep(supabase, herdId, num(formData, "budget_per_head"), await getLocale());
  if (error) redirect(`/herds/${herdId}?error=${encodeURIComponent(error)}`);

  revalidatePath(`/herds/${herdId}`);
  redirect(`/herds/${herdId}`);
}

/*
 * جاهزيّة القطيع للتصدير (البند ١١٧) — سجلّ الصحّة وأرقام الآذان.
 *
 * Every write goes through a database function that checks the herd is the
 * caller's and still running; the table itself refuses direct writes. Nothing
 * is deleted: a wrong entry is withdrawn with its reason, and a tag changes
 * status. The page anchors back to the readiness section so the farmer sees
 * what changed.
 */
const READY = (herdId: string, error?: string | null) =>
  `/herds/${herdId}${error ? `?rerror=${encodeURIComponent(error)}` : ""}#readiness`;

export async function addHealthRecord(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");
  const error = await addHerdHealthRecord(
    supabase,
    {
      herdId,
      choice: str(formData, "choice"),
      doneOn: str(formData, "done_on"),
      heads: num(formData, "heads"),
      result: str(formData, "result"),
      product: str(formData, "product"),
      batch: str(formData, "batch"),
      vet: str(formData, "vet_name"),
      note: str(formData, "note"),
    },
    await getLocale(),
  );
  revalidatePath(`/herds/${herdId}`);
  redirect(READY(herdId, error));
}

export async function withdrawHealthRecord(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");
  const { error } = await supabase.rpc("herd_health_withdraw", {
    p_record: str(formData, "record_id"),
    p_note: str(formData, "note"),
  });
  revalidatePath(`/herds/${herdId}`);
  redirect(READY(herdId, error ? await dbText(error.message) : undefined));
}

export async function addTagRange(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");
  const error = await addHerdTagRange(
    supabase,
    {
      herdId,
      prefix: str(formData, "prefix"),
      from: num(formData, "from"),
      to: formData.get("to") ? num(formData, "to") : null,
    },
    await getLocale(),
  );
  revalidatePath(`/herds/${herdId}`);
  redirect(READY(herdId, error));
}

export async function setTagStatus(formData: FormData) {
  const supabase = await createClient();
  const herdId = str(formData, "herd_id");
  const { error } = await supabase.rpc("herd_tag_set_status", {
    p_herd: herdId,
    p_tag: str(formData, "tag"),
    p_status: str(formData, "status"),
  });
  revalidatePath(`/herds/${herdId}`);
  redirect(READY(herdId, error ? await dbText(error.message) : undefined));
}
