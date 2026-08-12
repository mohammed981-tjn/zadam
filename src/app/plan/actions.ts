"use server";

import { createClient } from "@/lib/supabase/server";
import {
  planAllocation,
  scoreToRiskProfile,
  type Allocation,
  type RiskProfile,
} from "@/lib/portfolio";
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

  const riskProfile = scoreToRiskProfile(q1 + q2 + q3);
  const allocations = planAllocation(
    amount,
    riskProfile,
    (projects ?? []) as Project[],
  );
  const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

  return { riskProfile, allocations, allocatedAmount, requestedAmount: amount };
}
