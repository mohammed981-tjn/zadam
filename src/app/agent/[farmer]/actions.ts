"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signedIn, str, translator } from "@/lib/supplyActions";
import { agentAddEvidenceStep, agentCompleteStageStep } from "@/lib/agentCore";

/**
 * الوكيل يكتب مراحل موسم المزارع وأدلّتها (البند ١٦٩، قرار المالك 6 نوفمبر). القرار كلّه في القاعدة:
 * agent_stage_complete وagent_stage_evidence_add تسألان الإذن والموسم الجاري، وتمرّان بحرّاس الاعتماد والدليل أنفسها،
 * وتعلّمان ما كُتب وتسجّلانه وتخبران المزارع. هنا لا شيء غير التمرير وإرجاع الجواب — والتمرير في src/lib/agentCore.ts،
 * يستدعيه التطبيق أيضاً (البند ٢٠٣).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(farmer: string, key: "ok" | "error", message: string): never {
  const page = UUID.test(farmer) ? `/agent/${farmer}` : "/agent";
  revalidatePath(page);
  redirect(`${page}?${key}=${encodeURIComponent(message)}`);
}

export async function agentCompleteStage(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const r = await agentCompleteStageStep(supabase, str(fd, "stage_id"), locale);
  back(str(fd, "farmer"), r.ok ? "ok" : "error", r.message);
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
  const { locale } = await translator();
  const r = await agentAddEvidenceStep(supabase, user.id, args, locale);
  if (!r.ok) return { ok: false, message: r.message };
  if (UUID.test(args.farmer)) revalidatePath(`/agent/${args.farmer}`);
  return { ok: true };
}
