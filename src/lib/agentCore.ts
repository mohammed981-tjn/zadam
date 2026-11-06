import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { AGENT_SCOPES } from "@/lib/agent";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { explain } from "@/lib/supplyActions";
import type { Fields, StepResult } from "@/lib/supplyCore";

/**
 * وضع الوكيل (البند ١٦٩): كلّ خطوةٍ دالّةٌ في القاعدة تتحقّق ممّن يأخذها — الطالب شركةٌ موثّقة، والمجيب المزارع نفسه،
 * والمُنهي أحد الطرفين، والكاتب في الموسم وكيلٌ بإذنٍ قائمٍ في مواسمٍ جارية، والمعترض صاحب السطر. هنا التمرير والكلمات.
 *
 * One body for both doors (backlog 203): the website's server actions (src/app/agent/actions.ts and
 * src/app/agent/[farmer]/actions.ts) and the app's routes (src/app/api/app/agent/**), each with the caller's own
 * client. Registering a farmer without a phone is not here: it makes an account with the server's key, and stays on
 * the website (src/lib/supabase/admin.ts, caller 7).
 */

const translate = (locale: Locale) => (ar: string, en: string) => tr(locale, ar, en);

/** The scopes ticked on the form (`scope_lands=on`) or listed in JSON (`scopes: ["lands"]`). */
export function scopesOf(f: Fields): (typeof AGENT_SCOPES)[number][] {
  const listed = f.all("scopes");
  return AGENT_SCOPES.filter((s) => f.str(`scope_${s}`) === "on" || listed.includes(s));
}

export async function requestMandateStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const scopes = scopesOf(f);
  if (scopes.length === 0) return { ok: false, message: t("اختر ما تطلب الإذن فيه.", "Choose what you are asking permission for.") };
  const { error } = await supabase.rpc("agent_mandate_request", { p_phone: f.str("phone"), p_scopes: scopes, p_note: f.str("note") });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: t(
      "وصل طلبك إلى المزارع. يعمل الإذن حين يقبله من حسابه، ويظهر اسمه هنا حينها.",
      "Your request reached the farmer. The permission starts when they accept it from their account, and their name shows here then.",
    ),
  };
}

export async function answerMandateStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const accept = f.str("decision") === "accept";
  const { error } = await supabase.rpc("agent_mandate_answer", { p_id: f.str("id"), p_accept: accept });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: accept
      ? t("قبلت. صار الوكيل يعمل عنك في ما أذنت فيه، وتُنهيه من هنا متى شئت.", "Accepted. The agent now acts for you in what you allowed, and you can end it here whenever you like.")
      : t("اعتذرت، وأُخبر الوكيل.", "Declined; the agent has been told."),
  };
}

export async function endMandateStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const { error } = await supabase.rpc("agent_mandate_end", { p_id: f.str("id") });
  if (error) return { ok: false, message: explain(locale, error) };
  return { ok: true, message: translate(locale)("انتهى. وما سُجّل باسم المزارع يبقى له.", "Ended. What was registered in the farmer's name stays theirs.") };
}

/** The agent signs off a stage of the farmer's active season, marked as theirs (agent_stage_complete). */
export async function agentCompleteStageStep(supabase: SupabaseClient, stageId: string, locale: Locale): Promise<StepResult> {
  const { error } = await supabase.rpc("agent_stage_complete", { p_stage: stageId });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: translate(locale)(
      "اعتُمدت المرحلة باسمك وأُخبر المزارع. إن اعترض فُتحت من جديد.",
      "The stage is signed off in your name and the farmer has been told. If they object, it reopens.",
    ),
  };
}

/** A file the agent already uploaded to their own folder, recorded as evidence on the farmer's stage. */
export async function agentAddEvidenceStep(
  supabase: SupabaseClient,
  userId: string,
  args: { stageId: string; kind: string; storagePath: string; caption: string; metadata?: unknown },
  locale: Locale,
): Promise<StepResult> {
  const t = translate(locale);
  if (!args.stageId || !args.storagePath) {
    return { ok: false, message: t("بيانات الدليل ناقصة.", "The evidence details are incomplete.") };
  }
  if (!args.storagePath.startsWith(`${userId}/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }
  // The database checks it too (stage_evidence_insert_gate); asking here first gives the plainer message.
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: t("لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.", "We could not find the uploaded file. Upload it again and try once more."),
    };
  }
  const photo = sanitisePhotoMetadata(args.metadata);
  const { error } = await supabase.rpc("agent_stage_evidence_add", {
    p_stage: args.stageId,
    p_kind: args.kind,
    p_storage_path: args.storagePath,
    p_caption: args.caption,
    p_captured_at: photo.capturedAt,
    p_latitude: photo.latitude,
    p_longitude: photo.longitude,
  });
  if (error) return { ok: false, message: explain(locale, error) };
  return { ok: true, message: t("رُفع الدليل باسمه وأُخبر المزارع.", "The evidence is recorded in their name and the farmer has been told.") };
}

/**
 * The farmer objects to a line an agent wrote in their name (agent_write_object): recorded, the agent told, and the
 * stage reopened when that breaks no order.
 */
export async function objectAgentWriteStep(supabase: SupabaseClient, f: Fields, locale: Locale): Promise<StepResult> {
  const t = translate(locale);
  const action = Number(f.str("action_id"));
  if (!Number.isSafeInteger(action) || action <= 0) {
    return { ok: false, message: t("لا شيء بهذا في سجلّ وكلائك.", "There is no such entry in your agents' record.") };
  }
  const { data: reopened, error } = await supabase.rpc("agent_write_object", { p_action: action, p_reason: f.str("reason") });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: reopened
      ? t("سُجّل اعتراضك وأُخبر الوكيل، وفُتحت المرحلة من جديد: تعتمدها أنت حين تتمّ.", "Your objection is recorded and the agent told, and the stage is open again: you sign it off when it is done.")
      : t("سُجّل اعتراضك وأُخبر الوكيل، وتراه الإدارة.", "Your objection is recorded, the agent has been told, and the administrators can see it."),
  };
}
