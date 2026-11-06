import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/supplyActions";
import { recordSoilEstimate } from "@/lib/landSoil";
import { INVESTOR_MODELS } from "@/lib/investors";
import { INSPECTION_CHECKS } from "@/lib/inspections";
import type { Say, StepResult } from "@/lib/contractSteps";

/**
 * The steps between an investor and a landowner, one copy for the website and the phone app (backlog 203).
 *
 * Each is a database function that checks who is taking it (supabase/migrations/20261021210000_investor_
 * partnerships.sql and after). The website's actions (src/app/invest/actions.ts, src/app/invest/inspections/
 * actions.ts) and the app's routes under /api/app/invest both carry the request here with the caller's own client,
 * so the risk notice, the models a land accepts and the owner's consent are checked the same way for both. The
 * checks written here only turn an obviously incomplete request into a sentence before the round trip.
 */

/** The models a request names, as the land table accepts them. */
export const pickModels = (raw: readonly unknown[]) =>
  [...new Set(raw.map(String).filter((m) => (INVESTOR_MODELS as readonly string[]).includes(m)))];

export interface InterestInput {
  landId: string;
  model: string;
  message: string;
  /** "yes" when the investor ticked «قرأتُ هذا وفهمته» under the risk notice. */
  riskAck: string;
}

/**
 * «اطلب الشراكة» (backlog 124). The risk notice must be acknowledged (backlog 136): the database checks it too and
 * keeps the time it was given.
 */
export async function expressInvestorInterest(
  supabase: SupabaseClient,
  input: InterestInput,
  say: Say,
): Promise<StepResult> {
  const { t } = say;
  if (!(INVESTOR_MODELS as readonly string[]).includes(input.model)) {
    return { ok: false, message: t("اختر نموذج الشراكة.", "Choose a partnership model.") };
  }
  const message = input.message.trim();
  if (message.length < 10) {
    return {
      ok: false,
      message: t(
        "اكتب لصاحب الأرض سطرين على الأقلّ: من أنت، وماذا تقترح.",
        "Write the owner at least a couple of lines: who you are and what you propose.",
      ),
    };
  }
  // البند ١٣٦: الإقرار بالمخاطرة شرطٌ، والقاعدة تتحقّق منه وتحفظ وقته.
  if (input.riskAck !== "yes") {
    return {
      ok: false,
      message: t(
        "اقرأ تنبيه المخاطرة وأقرّ به قبل أن ترسل الطلب.",
        "Read the risk notice and confirm it before sending the request.",
      ),
    };
  }
  const { error } = await supabase.rpc("investor_express_interest", {
    p_land: input.landId,
    p_model: input.model,
    p_message: message.slice(0, 1000),
    p_risk_ack: true,
  });
  if (error) return { ok: false, message: explain(say.locale, error) };
  return { ok: true, data: null };
}

export const interestSentSentence = (t: Say["t"]) =>
  t(
    "أُرسل طلبك. وصل صاحبَ الأرض إشعار، وحين يقبل ترى اسمه وهاتفه وموقع الأرض هنا.",
    "Your request was sent. The owner has been notified; once they accept you will see their name, phone and the land's location here.",
  );

export interface ConsentInput {
  landId: string;
  open: boolean;
  models: string[];
  note: string;
}

/**
 * «اعرض أرضي على المستثمرين» (backlog 124): opens or closes a verified land to investors with the models its owner
 * accepts. The soil class is read here from the national soil map at the land's own coordinates, as for partner
 * companies — the owner does not type it — through the same server step the website and the app's land route use.
 * `land_set_investor_consent` checks the land is the caller's and verified.
 */
export async function setInvestorConsent(
  supabase: SupabaseClient,
  userId: string,
  input: ConsentInput,
  say: Say,
): Promise<StepResult> {
  const { t } = say;
  const chosen = pickModels(input.models);
  if (input.open && chosen.length === 0) {
    return { ok: false, message: t("اختر نموذجاً واحداً على الأقلّ من نماذج الشراكة.", "Choose at least one partnership model.") };
  }
  const { data: land } = await supabase
    .from("lands")
    .select("latitude, longitude, soil_class")
    .eq("id", input.landId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!land) return { ok: false, message: t("ليست لك هذه الأرض.", "This land is not yours.") };
  // The soil at the land's own point, not the 160 km map cell's (backlog 180). A failed read keeps what is stored.
  const estimate = input.open ? await recordSoilEstimate(userId, input.landId, land.longitude, land.latitude) : null;
  const note = input.note.trim().slice(0, 500);
  const { error } = await supabase.rpc("land_set_investor_consent", {
    p_land: input.landId,
    p_open: input.open,
    p_models: chosen,
    p_note: note.length >= 10 ? note : null,
    p_soil_class: estimate?.wrb ?? land.soil_class ?? null,
  });
  if (error) return { ok: false, message: explain(say.locale, error) };
  return { ok: true, data: null };
}

export const consentSentence = (open: boolean, t: Say["t"]) =>
  open
    ? t(
        "عُرضت أرضك في صفحة فرص الاستثمار. يرى المستثمر الولاية، وفئة المساحة (لا عدد الفدادين)، والتربة، ومصدر الماء. ولا يرى اسمك ولا المحلّيّة ولا المساحة الدقيقة ولا موقعها حتى تقبل طلبه.",
        "Your land is now on the investment opportunities page. Investors see its state, its area band (not the number of feddans), its soil and its water source. They do not see your name, the locality, the exact area or its location until you accept their request.",
      )
    : t("أُغلقت الأرض أمام المستثمرين.", "Your land is closed to investors.");

export interface InspectionInput {
  landId: string;
  checks: readonly unknown[];
  note: string;
}

/**
 * «اطلب تقرير معاينةٍ مستقلّ» (backlog 128): the paid, independent inspection. `land_inspection_request` checks the
 * caller is not the owner, that the land is offered, and that no inspection of theirs is already open on it.
 * Returns the inspection's id.
 */
export async function requestLandInspection(
  supabase: SupabaseClient,
  input: InspectionInput,
  say: Say,
): Promise<StepResult<string>> {
  const { t } = say;
  const checks = [
    ...new Set(input.checks.map(String).filter((c) => (INSPECTION_CHECKS as readonly string[]).includes(c))),
  ];
  if (checks.length === 0) {
    return { ok: false, message: t("اختر ما تريد أن يتحقّق منه المفتّش.", "Choose what the inspector should check.") };
  }
  const { data, error } = await supabase.rpc("land_inspection_request", {
    p_land: input.landId,
    p_checks: checks,
    p_note: input.note.slice(0, 1000) || null,
  });
  if (error || !data) return { ok: false, message: explain(say.locale, error) };
  return { ok: true, data: String(data) };
}

export const inspectionSentSentence = (t: Say["t"]) =>
  t(
    "أُرسل طلب المعاينة. وصل صاحبَ الأرض إشعار؛ وحين يوافق تُسنده الإدارة إلى مفتّش.",
    "Your inspection request was sent. The owner has been notified; once they agree, the administrators assign an inspector.",
  );
