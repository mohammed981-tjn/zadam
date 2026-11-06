"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * الوكيل يكتب مراحل موسم المزارع وأدلّتها (البند ١٦٩، قرار المالك 6 نوفمبر). القرار كلّه في القاعدة:
 * agent_stage_complete وagent_stage_evidence_add تسألان الإذن والموسم الجاري، وتمرّان بحرّاس الاعتماد والدليل أنفسها،
 * وتعلّمان ما كُتب وتسجّلانه وتخبران المزارع. هنا لا شيء غير التمرير وإرجاع الجواب.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(farmer: string, key: "ok" | "error", message: string): never {
  const page = UUID.test(farmer) ? `/agent/${farmer}` : "/agent";
  revalidatePath(page);
  redirect(`${page}?${key}=${encodeURIComponent(message)}`);
}

export async function agentCompleteStage(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const farmer = str(fd, "farmer");
  const { error } = await supabase.rpc("agent_stage_complete", { p_stage: str(fd, "stage_id") });
  if (error) back(farmer, "error", explain(locale, error));
  back(
    farmer,
    "ok",
    t(
      "اعتُمدت المرحلة باسمك وأُخبر المزارع. إن اعترض فُتحت من جديد.",
      "The stage is signed off in your name and the farmer has been told. If they object, it reopens.",
    ),
  );
}

/** A file the agent already uploaded to their own folder, recorded as evidence on the farmer's stage. */
export async function agentAddEvidence(args: {
  farmer: string;
  stageId: string;
  kind: string;
  storagePath: string;
  caption: string;
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const { supabase, user } = await signedIn();
  const { locale, t } = await translator();
  if (!args.stageId || !args.storagePath) {
    return { ok: false, message: t("بيانات الدليل ناقصة.", "The evidence details are incomplete.") };
  }
  if (!args.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }
  // The database checks it too (stage_evidence_insert_gate); asking here first gives the plainer message.
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: t(
        "لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.",
        "We could not find the uploaded file. Upload it again and try once more.",
      ),
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
  if (UUID.test(args.farmer)) revalidatePath(`/agent/${args.farmer}`);
  return { ok: true };
}
