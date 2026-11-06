import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { dbMessage } from "@/lib/dbMessages";
import { apportionBudget, planHerd } from "@/lib/livestock";
import { parseHealthChoice, type HealthRecord, type HerdTag } from "@/lib/herdHealth";
import { buildChecklist, type CheckLine, type ExportDestination } from "@/lib/livestockExportChecklist";
import { diseaseName, fetchDiseaseEvents } from "@/lib/animalDisease";
import { DISEASE_ALERT_DAYS, isoDaysBefore } from "@/lib/fieldAlerts";
import type { Herd } from "@/types/database";

/**
 * What the owner of a herd does, once, for the website and the phone app (backlog 203).
 *
 * The website's server actions (src/app/herds/actions.ts) carry their form here with the cookie client; the app's
 * routes (src/app/api/app/herds/**) carry the app's JSON here with the bearer client (src/lib/supabase/bearer.ts).
 * Same checks, same tables and database functions, same words, under the same row-level security. Each step answers
 * with what happened; the caller decides whether that is a redirect or a JSON reply.
 */

const T = (locale: Locale) => (ar: string, en: string) => tr(locale, ar, en);

export interface HerdInput {
  name: string;
  species: string;
  purpose: string;
  headCount: number;
  startDate: string;
  budgetPerHead: number;
  breed: string;
  projectId: string;
}

/**
 * Creates a herd and its phase plan together, deleting the herd if the phases fail to save: a herd with no plan is
 * worse than no herd, because it looks like a running cycle and has nothing scheduled underneath it.
 */
export async function createHerdWithPlan(
  supabase: SupabaseClient,
  userId: string,
  input: HerdInput,
  locale: Locale,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const t = T(locale);
  const name = input.name.trim();
  if (!name) return { ok: false, message: t("اسم الدورة مطلوب.", "The cycle name is required.") };

  const plan = planHerd(input.species, input.purpose, input.headCount, input.startDate, input.budgetPerHead);
  if (!plan) {
    return {
      ok: false,
      message: t(
        "تعذّر توليد خطة الدورة — راجع النوع والغرض والعدد وتاريخ البدء.",
        "Could not generate the cycle plan — check the species, purpose, number of head and start date.",
      ),
    };
  }

  const { data: herd, error: herdError } = await supabase
    .from("herds")
    .insert({
      owner_id: userId,
      project_id: input.projectId.trim() || null,
      name,
      species: plan.species.key,
      breed: input.breed.trim() || null,
      head_count: plan.headCount,
      purpose: plan.purpose,
      start_date: plan.startDate,
      end_date: plan.endDate,
    })
    .select("id")
    .single();

  if (herdError || !herd) {
    const why = dbMessage(herdError?.message ?? "", locale);
    return { ok: false, message: t(`تعذّر إنشاء الدورة: ${why}`, `Could not create the cycle: ${why}`) };
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
    const { error: rollbackError } = await supabase.from("herds").delete().eq("id", herdId);
    if (rollbackError) console.error("herd rollback failed — orphan left behind", { herdId, rollbackError });
    const why = dbMessage(stagesError.message, locale);
    return { ok: false, message: t(`تعذّر حفظ مراحل الدورة: ${why}`, `Could not save the cycle stages: ${why}`) };
  }

  return { ok: true, id: herdId };
}

/**
 * Closes a phase. The database refuses if an earlier one is still open, and its message is passed back because it is
 * written for the operator. Null when it closed.
 */
export async function completeHerdStageStep(supabase: SupabaseClient, stageId: string, locale: Locale): Promise<string | null> {
  const { error } = await supabase
    .from("herd_stages")
    .update({ completed: true, actual_end: new Date().toISOString().slice(0, 10) })
    .eq("id", stageId);
  return error ? dbMessage(error.message, locale) : null;
}

/**
 * Sets the budget per head after creation, re-deriving the split `planHerd` would have produced through the same
 * `apportionBudget`. Dates and feed are not touched: the schedule is what the cycle has been run against. Null when
 * it was saved; otherwise why not.
 */
export async function setHerdBudgetStep(
  supabase: SupabaseClient,
  herdId: string,
  perHead: number,
  locale: Locale,
): Promise<string | null> {
  const t = T(locale);
  if (!Number.isFinite(perHead) || perHead < 0) return t("الميزانية للرأس رقمٌ موجب.", "The budget per head must be a positive number.");

  const { data: herdRow } = await supabase.from("herds").select("head_count").eq("id", herdId).single();
  if (!herdRow) return t("الدورة غير موجودة أو ليست لك.", "The cycle does not exist or is not yours.");

  const { data: stageRows } = await supabase
    .from("herd_stages")
    .select("id, planned_feed_kg, stage_order")
    .eq("herd_id", herdId)
    .order("stage_order");
  const stages = (stageRows ?? []) as { id: string; planned_feed_kg: number | null; stage_order: number }[];
  if (stages.length === 0) return t("لا مراحلَ لهذه الدورة.", "This cycle has no stages.");

  const headCount = Number((herdRow as { head_count: number }).head_count);
  const budgets = apportionBudget(
    stages.map((s) => Number(s.planned_feed_kg ?? 0)),
    perHead * headCount,
  );

  for (let i = 0; i < stages.length; i++) {
    const { data, error } = await supabase.from("herd_stages").update({ budget: budgets[i] }).eq("id", stages[i].id).select("id");
    if (error) return dbMessage(error.message, locale);
    // ورفضُ سياسة الصفوف لا يرفع خطأً ولا يمسّ صفّاً، فيُقرأ نجاحاً.
    if ((data ?? []).length === 0) return t("لم تتغيّر الميزانية — الدورة ليست لك.", "The budget did not change — the cycle is not yours.");
  }
  return null;
}

export interface HealthRecordInput {
  herdId: string;
  /** "kind:key" from HEALTH_ITEMS, as the website's form sends it. */
  choice: string;
  doneOn: string;
  heads: number;
  result: string;
  product: string;
  batch: string;
  vet: string;
  note: string;
}

/** A vaccination, test or treatment in the herd's record (backlog 117), through `herd_health_add`. Null when saved. */
export async function addHerdHealthRecord(supabase: SupabaseClient, input: HealthRecordInput, locale: Locale): Promise<string | null> {
  const choice = parseHealthChoice(input.choice);
  if (!choice) return T(locale)("اختر التطعيم أو الفحص أو العلاج من القائمة.", "Choose the vaccination, test or treatment from the list.");
  const { kind, key } = choice;
  const { error } = await supabase.rpc("herd_health_add", {
    p_herd: input.herdId,
    p_kind: kind,
    p_item: key,
    p_done_on: input.doneOn || null,
    p_heads: Math.round(input.heads),
    p_result: kind === "test" ? input.result || null : null,
    p_product: input.product,
    p_batch: input.batch,
    p_vet: input.vet,
    p_note: input.note,
  });
  return error ? dbMessage(error.message, locale) : null;
}

/** Consecutive ear-tag numbers, through `herd_tags_add_range`. `to` absent is one tag. Null when saved. */
export async function addHerdTagRange(
  supabase: SupabaseClient,
  input: { herdId: string; prefix: string; from: number; to: number | null },
  locale: Locale,
): Promise<string | null> {
  const from = Math.round(input.from);
  const to = input.to === null ? from : Math.round(input.to);
  const { error } = await supabase.rpc("herd_tags_add_range", {
    p_herd: input.herdId,
    p_prefix: input.prefix,
    p_from: from,
    p_to: to,
  });
  return error ? dbMessage(error.message, locale) : null;
}

/** The species the readiness section is for: ruminants and camels; poultry and fish are not exported live from here. */
export const isExportable = (species: string) => ["cattle", "sheep", "goat", "camel"].includes(species);

/**
 * The herd's export readiness (backlog 117): its health record and ear tags, and the checklist for a destination,
 * with «from an area without reported epidemic disease» answered from FAO's events in the state of the herd's land.
 * Read as the caller, so the policies decide what is returned; empty for a species that is not exported live.
 */
export async function loadHerdReadiness(
  supabase: SupabaseClient,
  herd: Pick<Herd, "id" | "species" | "head_count" | "land_id">,
  destination: ExportDestination,
  locale: Locale,
): Promise<{ exportable: boolean; records: HealthRecord[]; tags: HerdTag[]; stateDiseases: string[] | null; checklist: CheckLine[] }> {
  const exportable = isExportable(herd.species);
  if (!exportable) return { exportable, records: [], tags: [], stateDiseases: null, checklist: [] };
  const [{ data: recordRows }, { data: tagRows }] = await Promise.all([
    supabase
      .from("herd_health_records")
      .select("id, kind, item_key, done_on, heads, result, product, batch, vet_name, note, withdrawn_at, withdrawn_note, created_at")
      .eq("herd_id", herd.id)
      .order("done_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("herd_tags").select("tag, status, added_on").eq("herd_id", herd.id).order("added_on").order("tag"),
  ]);

  // «من منطقةٍ لم تُسجَّل فيها أمراض وبائيّة»: ولاية أرض القطيع مقابل ما وصل الفاو.
  let stateDiseases: string[] | null = null;
  if (herd.land_id) {
    const { data: land } = await supabase.from("lands").select("state").eq("id", herd.land_id).maybeSingle();
    const state = (land as { state: string | null } | null)?.state ?? null;
    const events = state ? await fetchDiseaseEvents() : null;
    if (state && events) {
      const today = new Date().toISOString().slice(0, 10);
      const since = isoDaysBefore(today, DISEASE_ALERT_DAYS);
      stateDiseases = [
        ...new Set(
          events
            .filter((e) => e.country === "Sudan" && e.state === state && e.date >= since && e.date <= today)
            .map((e) => diseaseName(e.disease, locale)),
        ),
      ];
    }
  }
  const records = (recordRows ?? []) as HealthRecord[];
  const tags = (tagRows ?? []) as HerdTag[];
  const checklist = buildChecklist(destination, {
    species: herd.species,
    headCount: herd.head_count,
    records,
    tags,
    stateDiseases,
    today: new Date().toISOString().slice(0, 10),
  });
  return { exportable, records, tags, stateDiseases, checklist };
}
