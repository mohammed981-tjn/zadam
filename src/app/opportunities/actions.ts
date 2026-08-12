"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assessProject, type ProjectFacts, type WaterSource } from "@/lib/risk";
import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from "@/lib/agronomy";

export interface SubmitResult {
  ok: boolean;
  message: string;
  blockers?: string[];
}

const num = (fd: FormData, key: string) => Number(fd.get(key));
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Accepts an opportunity from a farmer or field agent.
 *
 * The score shown while typing is a convenience; the score that is stored is
 * recomputed here, because anything the browser sends can be edited. The
 * database enforces the same rules again with a trigger, so a submission has to
 * get past three independent checks to be published.
 */
export async function submitOpportunity(
  _prev: SubmitResult | null,
  formData: FormData,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const name = str(formData, "name");
  const location = str(formData, "location");
  const description = str(formData, "description");

  if (!name || !location) {
    return { ok: false, message: "اسم الفرصة وموقعها مطلوبان." };
  }

  const irrigation = str(formData, "irrigation") as IrrigationMethod;
  if (!(irrigation in IRRIGATION_EFFICIENCY)) {
    return { ok: false, message: "طريقة ري غير معروفة." };
  }

  const facts: ProjectFacts = {
    cropKey: str(formData, "crop_key"),
    stationKey: str(formData, "station_key"),
    plantingMonth: num(formData, "planting_month"),
    irrigation,
    waterSource: str(formData, "water_source") as WaterSource,
    declaredWaterPerFeddan: num(formData, "declared_water_per_feddan"),
    documentsOnFile: num(formData, "documents_on_file"),
    documentsRequired: 4,
    operatorSeasons: 0,
    operatorReportingRate: 0,
    kmToMarket: num(formData, "km_to_market"),
  };

  // The operator's record comes from the platform's own history, never from
  // the form — that is the whole point of a track record.
  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_seasons, reporting_rate")
    .eq("id", user.id)
    .single();

  if (profile) {
    const p = profile as { completed_seasons: number; reporting_rate: number };
    facts.operatorSeasons = p.completed_seasons ?? 0;
    facts.operatorReportingRate = p.reporting_rate ?? 0;
  }

  const totalFeddans = num(formData, "total_feddans");
  const pricePerShare = num(formData, "price_per_share");
  const totalShares = num(formData, "total_shares");

  if (
    ![totalFeddans, pricePerShare, totalShares].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  ) {
    return {
      ok: false,
      message: "المساحة وسعر الحصة وعددها يجب أن تكون أرقاماً موجبة.",
    };
  }

  const assessment = assessProject(facts);

  if (assessment.blockers.length > 0) {
    return {
      ok: false,
      message: "لا يمكن رفع الفرصة قبل معالجة الملاحظات التالية:",
      blockers: assessment.blockers,
    };
  }

  const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const { error } = await supabase.from("projects").insert({
    slug,
    name,
    location,
    description: description || null,
    total_feddans: totalFeddans,
    price_per_share: pricePerShare,
    total_shares: totalShares,
    shares_sold: 0,
    // The database trigger rejects anything other than a submitted draft from
    // a non-admin, so these values are a statement of intent, not the control.
    status: "draft",
    review_status: "submitted",
    is_demo: false,
    risk_level: assessment.level,
    submitted_by: user.id,
    crop_key: facts.cropKey,
    station_key: facts.stationKey,
    planting_month: facts.plantingMonth,
    irrigation: facts.irrigation,
    water_source: facts.waterSource,
    declared_water_per_feddan: facts.declaredWaterPerFeddan,
    documents_on_file: facts.documentsOnFile,
    documents_required: 4,
    km_to_market: facts.kmToMarket,
  });

  if (error) {
    return { ok: false, message: `تعذّر رفع الفرصة: ${error.message}` };
  }

  return {
    ok: true,
    message:
      `تم رفع الفرصة بدرجة تقييم ${assessment.score}/100. ` +
      "ستراجعها الإدارة قبل نشرها للجمهور، وسنتواصل معك.",
  };
}
