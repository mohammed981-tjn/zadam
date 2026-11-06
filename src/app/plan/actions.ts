"use server";

import { createClient } from "@/lib/supabase/server";
import { planFromAnswers, type PlanResult } from "@/lib/investmentPlan";
import { getLocale } from "@/lib/locale";

export type { PlanResult };

/** The split itself is worked out in lib/investmentPlan.ts, shared with the phone app's /api/app/plan. */
export async function generatePlan(
  formData: FormData,
): Promise<PlanResult | { error: string }> {
  const supabase = await createClient();
  return planFromAnswers(
    supabase,
    {
      amount: Number(formData.get("amount")),
      q1: Number(formData.get("q1")),
      q2: Number(formData.get("q2")),
      q3: Number(formData.get("q3")),
    },
    await getLocale(),
  );
}
