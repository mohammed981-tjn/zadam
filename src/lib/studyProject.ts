import type { SupabaseClient } from "@supabase/supabase-js";
import { CROP_INPUTS } from "@/lib/cropInputs";
import { itemsFromStudy } from "@/lib/inputPlans";
import { explain } from "@/lib/supplyActions";
import { tr, type Locale } from "@/lib/i18n";

/**
 * «حوّلها إلى مشروع» — from the feasibility study to an input list in «مشروعي».
 *
 * The one place the step is taken, for the website's form (src/app/my-project/actions.ts) and the phone app's route
 * (/api/app/feasibility/project): the same checks, then `input_plan_create`, the database function that checks who
 * is calling (20261020130000_input_plans.sql). The items are built here from the crop's published sources, never
 * taken from the caller. No money moves: the farmer pays each supplier directly and records it.
 */
export async function createPlanFromStudyCore(
  supabase: SupabaseClient,
  input: { crop: string; feddans: number | null; title?: string; landId?: string | null },
  locale: Locale,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { crop, feddans } = input;
  if (!CROP_INPUTS[crop]) return { ok: false, message: t("لا قائمة مدخلات منشورة لهذا المحصول بعد.", "No published input list for this crop yet.") };
  if (feddans === null || !Number.isFinite(feddans) || feddans <= 0) {
    return { ok: false, message: t("اكتب المساحة بالفدان في الدراسة أوّلاً.", "Enter the area in feddans in the study first.") };
  }
  const title = (input.title ?? "").trim() || t("مشروع الموسم", "This season's project");
  const { error } = await supabase.rpc("input_plan_create", {
    p_title: title.slice(0, 80),
    p_crop: crop,
    p_feddans: feddans,
    p_land: input.landId || null,
    p_items: itemsFromStudy(crop, feddans),
  });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: t(
      "أُنشئت القائمة من دراسة الجدوى. اكتب أسعار الموردين ثمّ وافق عليها.",
      "The list was made from the feasibility study. Write the suppliers' prices, then approve it.",
    ),
  };
}
