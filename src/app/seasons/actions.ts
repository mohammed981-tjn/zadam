"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planSeason, type LedgerCategory } from "@/lib/season";
import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from "@/lib/agronomy";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Creates a season and writes its stage plan in one transaction-like sequence.
 *
 * The stages are generated from the FAO-56 crop model rather than typed in, so
 * the dates and the water figures are derived from the crop and the location
 * instead of guessed.
 */
export async function createSeason(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  const irrigation = str(formData, "irrigation") as IrrigationMethod;

  if (!name) return { ok: false, message: "اسم الموسم مطلوب." };
  if (!(irrigation in IRRIGATION_EFFICIENCY)) {
    return { ok: false, message: "طريقة ري غير معروفة." };
  }

  const plan = planSeason(
    str(formData, "crop_key"),
    str(formData, "station_key"),
    str(formData, "planting_date"),
    irrigation,
    num(formData, "feddans"),
    num(formData, "budget_per_feddan"),
  );

  if (!plan) {
    return {
      ok: false,
      message:
        "تعذّر توليد خطة الموسم — راجع المحصول والمنطقة وتاريخ الزراعة والمساحة.",
    };
  }

  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .insert({
      owner_id: user.id,
      name,
      location: str(formData, "location") || null,
      crop_key: plan.crop.key,
      station_key: plan.station.key,
      irrigation,
      feddans: plan.feddans,
      budget_per_feddan: num(formData, "budget_per_feddan"),
      planting_date: plan.plantingDate,
      harvest_date: plan.harvestDate,
    })
    .select("id")
    .single();

  if (seasonError || !season) {
    return {
      ok: false,
      message: `تعذّر إنشاء الموسم: ${seasonError?.message}`,
    };
  }

  const seasonId = (season as { id: string }).id;

  const { error: stagesError } = await supabase.from("season_stages").insert(
    plan.stages.map((s) => ({
      season_id: seasonId,
      stage_key: s.key,
      stage_order: s.order,
      planned_start: s.startDate,
      planned_end: s.endDate,
      planned_water_m3: s.waterM3,
      budget: s.budget,
    })),
  );

  if (stagesError) {
    // Do not leave a season with no plan behind.
    await supabase.from("seasons").delete().eq("id", seasonId);
    return {
      ok: false,
      message: `تعذّر حفظ مراحل الموسم: ${stagesError.message}`,
    };
  }

  redirect(`/seasons/${seasonId}`);
}

/** Attaches evidence to a stage. Without at least one, the stage cannot close. */
export async function addEvidence(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stageId = str(formData, "stage_id");
  const caption = str(formData, "caption");
  const kind = str(formData, "kind");

  if (!stageId || !caption) return;
  if (!["photo", "invoice", "inspection", "note"].includes(kind)) return;

  await supabase.from("stage_evidence").insert({
    stage_id: stageId,
    kind,
    caption,
    url: str(formData, "url") || null,
    created_by: user.id,
  });

  revalidatePath(`/seasons/${str(formData, "season_id")}`);
}

/**
 * Marks a stage done. The database trigger refuses if evidence is missing or an
 * earlier stage is still open, and its message is passed straight back so the
 * farmer sees the real reason rather than a generic failure.
 */
export async function completeStage(formData: FormData) {
  const supabase = await createClient();
  const seasonId = str(formData, "season_id");

  const { error } = await supabase
    .from("season_stages")
    .update({
      completed: true,
      actual_end: new Date().toISOString().slice(0, 10),
    })
    .eq("id", str(formData, "stage_id"));

  revalidatePath(`/seasons/${seasonId}`);

  if (error) {
    redirect(`/seasons/${seasonId}?error=${encodeURIComponent(error.message)}`);
  }
}

export async function addLedgerEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const seasonId = str(formData, "season_id");
  const amount = num(formData, "amount");
  const category = str(formData, "category") as LedgerCategory;

  const valid: LedgerCategory[] = [
    "seeds",
    "fertiliser",
    "pesticide",
    "labour",
    "irrigation",
    "transport",
    "other",
    "revenue",
  ];

  if (!seasonId || !valid.includes(category)) return;
  if (!Number.isFinite(amount) || amount < 0) return;

  await supabase.from("ledger_entries").insert({
    season_id: seasonId,
    category,
    amount,
    description: str(formData, "description") || null,
    created_by: user.id,
  });

  revalidatePath(`/seasons/${seasonId}`);
}

/** Closing a season is what credits the operator's track record. */
export async function completeSeason(formData: FormData) {
  const supabase = await createClient();
  const seasonId = str(formData, "season_id");

  await supabase
    .from("seasons")
    .update({ status: "completed" })
    .eq("id", seasonId);

  revalidatePath(`/seasons/${seasonId}`);
  revalidatePath("/seasons");
}
