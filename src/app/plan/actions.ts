"use server";

import { createClient } from "@/lib/supabase/server";
import {
  planAllocation,
  scoreToRiskProfile,
  type Allocation,
  type RiskProfile,
} from "@/lib/portfolio";
import { assessProject, type WaterSource } from "@/lib/risk";
import type { IrrigationMethod } from "@/lib/agronomy";
import type { Project } from "@/types/database";

export interface PlanResult {
  riskProfile: RiskProfile;
  allocations: Allocation[];
  allocatedAmount: number;
  requestedAmount: number;
}

export async function generatePlan(
  formData: FormData,
): Promise<PlanResult | { error: string }> {
  const amount = Number(formData.get("amount"));
  const q1 = Number(formData.get("q1"));
  const q2 = Number(formData.get("q2"));
  const q3 = Number(formData.get("q3"));

  if (!Number.isFinite(amount) || amount < 50) {
    return { error: "أدخل مبلغاً صحيحاً لا يقل عن 50$." };
  }
  if (![q1, q2, q3].every((q) => q >= 1 && q <= 3)) {
    return { error: "أجب عن جميع أسئلة تحمّل المخاطرة." };
  }

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("status", "open");

  if (error) {
    return { error: "تعذّر جلب المشاريع، حاول لاحقاً." };
  }

  /*
   * The allocator used to read projects.risk_level, a field somebody typed by
   * hand. Where the scoring engine has enough facts to judge a project — its
   * water coverage, documentation and operator record — that computed verdict
   * replaces the typed one, so the allocation follows evidence rather than an
   * opinion. Projects predating the scoring fields keep their stored level.
   */
  const scored = ((projects ?? []) as Project[]).map((p) => {
    if (!p.crop_key || !p.station_key) return p;

    const assessment = assessProject({
      cropKey: p.crop_key,
      stationKey: p.station_key,
      plantingMonth: p.planting_month ?? 0,
      irrigation: (p.irrigation ?? "flood") as IrrigationMethod,
      waterSource: (p.water_source ?? "canal") as WaterSource,
      declaredWaterPerFeddan: p.declared_water_per_feddan ?? 0,
      documentsOnFile: p.documents_on_file,
      documentsRequired: p.documents_required,
      operatorSeasons: 0,
      operatorReportingRate: 0,
      kmToMarket: p.km_to_market ?? 0,
    });

    // A project the engine refuses outright never belongs in a suggestion.
    if (assessment.blockers.length > 0) return null;

    return { ...p, risk_level: assessment.level };
  });

  const riskProfile = scoreToRiskProfile(q1 + q2 + q3);
  const allocations = planAllocation(
    amount,
    riskProfile,
    scored.filter((p): p is Project => p !== null),
  );
  const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

  return { riskProfile, allocations, allocatedAmount, requestedAmount: amount };
}
