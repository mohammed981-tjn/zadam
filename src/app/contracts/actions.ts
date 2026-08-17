"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planSeason } from "@/lib/season";
import { buildMilestonePlan, type ServiceKey } from "@/lib/services";
import type { IrrigationMethod } from "@/lib/agronomy";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Creates a staged service contract against a season.
 *
 * The one rule here is worth stating loudly, because the platform has already
 * been bitten by its opposite: **no quantity and no price is taken from the
 * browser.** The form sends which services were chosen and nothing else that
 * costs money. The season is re-read from the database, the plan is
 * re-derived from FAO-56, and every unit price is re-read from the provider's
 * own catalogue row.
 *
 * A request that posts `unit_price=1` therefore buys nothing at a discount — it
 * is simply ignored, because the number it names is never read. The alternative,
 * trusting a hidden field, is how a platform ends up recording a hundred shares
 * at a hundred pounds instead of a hundred thousand.
 */
export async function createContract(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const seasonId = str(formData, "season_id");
  const providerId = str(formData, "provider_id");
  const title = str(formData, "title");

  if (!seasonId) return { ok: false, message: "اختر الموسم." };
  if (!providerId) return { ok: false, message: "اختر مقدّم الخدمة." };
  if (!title) return { ok: false, message: "اكتب عنواناً للعقد." };

  const chosen = formData.getAll("service_key").map(String) as ServiceKey[];
  if (chosen.length === 0) {
    return { ok: false, message: "اختر خدمة واحدة على الأقل." };
  }

  // The season, straight from the database. RLS means a season that is not the
  // caller's simply does not come back, so this doubles as the ownership check.
  const { data: seasonRow, error: seasonError } = await supabase
    .from("seasons")
    .select("id, project_id, crop_key, station_key, irrigation, feddans, budget_per_feddan, planting_date")
    .eq("id", seasonId)
    .single();

  if (seasonError || !seasonRow) {
    return { ok: false, message: "الموسم غير موجود أو ليس لك." };
  }

  const season = seasonRow as {
    id: string;
    project_id: string | null;
    crop_key: string;
    station_key: string;
    irrigation: IrrigationMethod;
    feddans: number;
    budget_per_feddan: number;
    planting_date: string;
  };

  const plan = planSeason(
    season.crop_key,
    season.station_key,
    season.planting_date,
    season.irrigation,
    season.feddans,
    season.budget_per_feddan,
  );

  if (!plan) {
    return { ok: false, message: "تعذّر اشتقاق خطة الموسم لحساب الكميات." };
  }

  // Prices from the provider's catalogue, never from the request.
  const { data: offerRows } = await supabase
    .from("services")
    .select("service_key, price_per_unit")
    .eq("provider_id", providerId)
    .eq("active", true)
    .in("service_key", chosen);

  const priceFor = new Map(
    ((offerRows ?? []) as { service_key: ServiceKey; price_per_unit: number }[]).map(
      (o) => [o.service_key, Number(o.price_per_unit)],
    ),
  );

  const choices = chosen
    .filter((key) => priceFor.has(key))
    .map((key) => ({ serviceKey: key, unitPrice: priceFor.get(key)! }));

  if (choices.length === 0) {
    return {
      ok: false,
      message: "لا يقدّم هذا المزوّد أياً من الخدمات المختارة.",
    };
  }

  const milestones = buildMilestonePlan(
    choices,
    { feddans: plan.feddans, waterM3: plan.totalWaterM3 },
    plan.stages.map((s) => ({
      key: s.key,
      startDate: s.startDate,
      endDate: s.endDate,
    })),
  );

  if (milestones.length === 0) {
    return {
      ok: false,
      message: "تعذّر اشتقاق كميات الخدمات المختارة لهذا الموسم.",
    };
  }

  const { data: contract, error: contractError } = await supabase
    .from("service_contracts")
    .insert({
      project_id: season.project_id,
      season_id: season.id,
      provider_id: providerId,
      client_id: user.id,
      title: title.slice(0, 160),
      status: "draft",
    })
    .select("id")
    .single();

  if (contractError || !contract) {
    return { ok: false, message: `تعذّر إنشاء العقد: ${contractError?.message}` };
  }

  const contractId = (contract as { id: string }).id;

  const { error: milestoneError } = await supabase
    .from("contract_milestones")
    .insert(
      milestones.map((m) => ({
        contract_id: contractId,
        seq: m.seq,
        title: m.title,
        unit: m.unit,
        quantity: m.quantity,
        unit_price: m.unitPrice,
        planned_start: m.plannedStart,
        planned_end: m.plannedEnd,
        // The derivation travels with the line, so either party can check the
        // arithmetic later without rebuilding the season plan from scratch.
        feasibility: {
          basis: m.basis,
          note: m.note,
          derived_from:
            m.basis === "water_m3"
              ? "FAO-56 seasonal irrigation requirement"
              : m.basis === "feddans"
                ? "seasons.feddans"
                : m.basis,
        },
      })),
    );

  if (milestoneError) {
    // A contract with no phases is worse than no contract: it shows a total of
    // zero and looks agreed. Remove it rather than leave that behind.
    await supabase.from("service_contracts").delete().eq("id", contractId);
    return { ok: false, message: `تعذّر حفظ المراحل: ${milestoneError.message}` };
  }

  revalidatePath("/contracts");
  redirect(`/contracts/${contractId}`);
}

/**
 * Records a file already uploaded to storage as proof that a phase was done.
 *
 * Mirrors addEvidence on the season side, including the ownership check on the
 * storage path: the storage policy stops an upload outside the user's own
 * folder, and this stops a crafted request from referencing someone else's
 * object after the fact.
 */
export async function addMilestoneEvidence(args: {
  milestoneId: string;
  contractId: string;
  kind: string;
  storagePath: string;
  caption: string;
  /** EXIF read in the browser before compression re-encoded the file. */
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!args.milestoneId || !args.storagePath) {
    return { ok: false, message: "بيانات الدليل ناقصة." };
  }
  if (!["photo", "invoice", "inspection", "report", "note"].includes(args.kind)) {
    return { ok: false, message: "نوع دليل غير معروف." };
  }
  if (!args.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, message: "مسار ملف غير صالح." };
  }

  const { sanitisePhotoMetadata } = await import("@/lib/exif");
  const photo = sanitisePhotoMetadata(args.metadata);

  const { error } = await supabase.from("milestone_evidence").insert({
    milestone_id: args.milestoneId,
    kind: args.kind,
    caption: args.caption,
    storage_path: args.storagePath,
    captured_at: photo.capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    created_by: user.id,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/contracts/${args.contractId}`);
  return { ok: true };
}

/** Moves a phase along. The database enforces proof and order, not this file. */
export async function setMilestoneStatus(formData: FormData) {
  const supabase = await createClient();
  const contractId = str(formData, "contract_id");
  const status = str(formData, "status");

  if (!["in_progress", "submitted", "approved", "paid"].includes(status)) return;

  const { error } = await supabase
    .from("contract_milestones")
    .update({ status })
    .eq("id", str(formData, "milestone_id"));

  revalidatePath(`/contracts/${contractId}`);

  if (error) {
    // The trigger's message is the real reason — "لا يمكن اعتماد المرحلة قبل
    // رفع إثبات تنفيذ" — and it is written for the user, so it is passed
    // through rather than replaced with something generic.
    redirect(`/contracts/${contractId}?error=${encodeURIComponent(error.message)}`);
  }
}
