"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * إلحاقُ حدثٍ بسلسلة العهدة.
 *
 * The chain is append-only in the database — two rules refuse UPDATE and DELETE
 * outright — so there is no edit action here and there cannot be one. That is
 * the point: a custody chain its author can revise is a claim about the past,
 * not a record of it.
 *
 * The sequence is computed here rather than typed, and the unique constraint on
 * (offer_id, sequence) is what makes two simultaneous appends fail loudly
 * instead of silently sharing a number.
 */
export async function addCustodyEvent(
  offerId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const place = str(formData, "place_name");
  const occurredAt = str(formData, "occurred_at");
  if (!place) return { ok: false, message: "اسم المكان مطلوب." };
  if (!occurredAt) return { ok: false, message: "وقت الحدث مطلوب." };

  const { data: last } = await supabase
    .from("export_offer_custody")
    .select("sequence")
    .eq("offer_id", offerId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = ((last as { sequence: number } | null)?.sequence ?? 0) + 1;

  const lat = str(formData, "latitude");
  const lon = str(formData, "longitude");

  const { data, error } = await supabase
    .from("export_offer_custody")
    .insert({
      offer_id: offerId,
      sequence: next,
      occurred_at: new Date(occurredAt).toISOString(),
      place_name: place,
      latitude: lat || null,
      longitude: lon || null,
      note: str(formData, "note") || null,
    })
    .select("id");

  if (error) {
    console.error("export: custody insert failed", error);
    return {
      ok: false,
      message:
        "تعذّر إضافة الحدث. تأكّد أنّ العرض ما يزال مسوّدة — السلسلة لا تُعدَّل بعد الإرسال.",
    };
  }

  // Zero rows without an error is what a declined policy looks like.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "لم يُضَف شيء — العرض ليس في حالةٍ تسمح بالتعديل.",
    };
  }

  revalidatePath(`/export/offers/${offerId}`);
  return { ok: true, message: `أُضيف الحدث رقم ${next}.` };
}

/**
 * إلحاقُ دليلٍ موجودٍ في المنصّة بالعرض — ببصمةٍ محسوبةٍ من الملفّ نفسِه.
 *
 * WHY THE HASH IS COMPUTED FROM THE FILE AND NOT THE PATH
 *
 * A fingerprint taken from the storage path always matches and never reveals a
 * substitution — it is decoration that reads as a guarantee, which is worse
 * than no field at all. So the file is downloaded and hashed. If it cannot be
 * downloaded, the evidence is attached without a hash rather than with a false
 * one, and the review screen shows "بلا بصمة" so a reviewer can see the
 * difference.
 *
 * WHY THE FILE IS READ WITH THE SESSION CLIENT
 *
 * The `evidence` bucket is private, and its policy admits the file's own owner
 * or an administrator. The farmer attaching their own evidence is exactly that
 * owner, so no elevated key is needed — and using one would mean this action
 * could read any farmer's file if the offer id were ever mismatched.
 */
export async function attachEvidence(
  offerId: string,
  stageEvidenceId: string,
  documentTypeId?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on stage_evidence is what restricts this to the caller's own rows; the
  // select is written plainly and the boundary does the refusing.
  const { data: source, error: readError } = await supabase
    .from("stage_evidence")
    .select("id, kind, storage_path, captured_at, latitude, longitude")
    .eq("id", stageEvidenceId)
    .maybeSingle();

  if (readError || !source) {
    return { ok: false, message: "لم أجد هذا الدليل، أو ليس لك." };
  }

  const row = source as {
    kind: string;
    storage_path: string | null;
    captured_at: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  if (!row.storage_path) {
    return {
      ok: false,
      message: "هذا الدليل بلا ملفّ مرفوع، فلا شيء يُلحق بالعرض.",
    };
  }

  let sha256: string | null = null;
  const { data: file, error: downloadError } = await supabase.storage
    .from("evidence")
    .download(row.storage_path);

  if (downloadError || !file) {
    // Logged and carried on without a hash. An unhashed reference is weaker,
    // and the review screen says so; a fabricated hash would be a lie.
    console.warn("export: could not hash evidence", row.storage_path, downloadError);
  } else {
    sha256 = createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex");
  }

  const { data, error } = await supabase
    .from("export_offer_evidence")
    .insert({
      offer_id: offerId,
      kind: row.kind,
      captured_at: row.captured_at,
      latitude: row.latitude,
      longitude: row.longitude,
      storage_path: row.storage_path,
      sha256,
      // Optional, and it stays optional. A photograph of the field is evidence
      // and answers no document requirement; forcing a type here would either
      // block the attachment or teach people to label it with whatever is
      // nearest, and a readiness score built on mislabelled rows is worse than
      // one that admits the document is missing.
      document_type_id: documentTypeId || null,
    })
    .select("id");

  if (error) {
    console.error("export: evidence attach failed", error);
    return { ok: false, message: "تعذّر إلحاق الدليل بالعرض." };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "لم يُلحق شيء — العرض ليس في حالةٍ تسمح بالتعديل.",
    };
  }

  revalidatePath(`/export/offers/${offerId}`);
  return {
    ok: true,
    message: sha256
      ? "أُلحق الدليل، وبصمتُه محسوبةٌ من الملفّ."
      : "أُلحق الدليل بلا بصمة — تعذّرت قراءة الملفّ. سيراه المراجع «بلا بصمة».",
  };
}

/**
 * تسميةُ الدليل بنوع المستند الذي يفي به — وهو ما يجعل «٧ من ٨» رقماً.
 *
 * WHY THIS EXISTS SEPARATELY FROM ATTACHING
 *
 * Evidence was attached for a year before there was anything to attach it to:
 * `kind` is free text and matches no document type. Those rows are real proof
 * sitting in offers that read as zero percent ready, and an action that could
 * only classify at the moment of attachment would leave every one of them
 * uncountable forever.
 *
 * WHY IT ACCEPTS BEING SET BACK TO NOTHING
 *
 * Mislabelling is the failure this whole score is exposed to — a certificate of
 * origin tagged as a phytosanitary certificate makes an offer look shippable
 * when it is not. Someone who notices must be able to take the label off, and
 * the file itself stays put either way: `evidence_delete_own` refuses to remove
 * it once the offer has left draft, whatever it is called.
 */
export async function classifyEvidence(
  offerId: string,
  evidenceId: string,
  documentTypeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("export_offer_evidence")
    .update({ document_type_id: documentTypeId || null })
    .eq("id", evidenceId)
    .eq("offer_id", offerId)
    .select("id");

  if (error) {
    console.error("export: evidence classify failed", error);
    return { ok: false, message: "تعذّر تعديل نوع المستند." };
  }

  // A filtered UPDATE that policy declines returns no error and no rows — the
  // refusal and the success look identical from here, so the row count is the
  // only thing that can tell them apart.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "لم يتغيّر شيء — العرض ليس في حالةٍ تسمح بالتعديل.",
    };
  }

  revalidatePath(`/export/offers/${offerId}`);
  return {
    ok: true,
    message: documentTypeId
      ? "سُمّي الدليل، وحُسب في الجاهزيّة."
      : "أُزيل النوع — لم يعد يُحسب مستنداً.",
  };
}
