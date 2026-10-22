"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { INSPECTION_CHECKS, RESULTS, VERDICTS } from "@/lib/inspections";

/**
 * Every step of an inspection is a database function that checks who is
 * taking it (supabase/migrations/20261022010000_land_inspections.sql). These
 * carry the form there and bring the answer back as ?ok= / ?error=.
 */

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/invest", "layout");
  revalidatePath("/lands");
  revalidatePath("/admin/inspections");
  revalidatePath("/admin/inbox");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

const page = (id: string) => `/invest/inspections/${id}`;

// ── المستثمر ─────────────────────────────────────────────────────────────────

export async function requestInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const checks = [
    ...new Set(fd.getAll("checks").map(String).filter((c) => (INSPECTION_CHECKS as readonly string[]).includes(c))),
  ];
  if (checks.length === 0) {
    back("/invest", "error", t("اختر ما تريد أن يتحقّق منه المفتّش.", "Choose what the inspector should check."));
  }
  const { data, error } = await supabase.rpc("land_inspection_request", {
    p_land: str(fd, "land_id"),
    p_checks: checks,
    p_note: str(fd, "note").slice(0, 1000) || null,
  });
  if (error || !data) back("/invest", "error", explain(locale, error));
  back(
    page(String(data)),
    "ok",
    t(
      "أُرسل طلب المعاينة. وصل صاحبَ الأرض إشعار؛ وحين يوافق تُسنده الإدارة إلى مفتّش.",
      "Your inspection request was sent. The owner has been notified; once they agree, the administrators assign an inspector.",
    ),
  );
}

export async function cancelInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "inspection_id");
  const { error } = await supabase.rpc("land_inspection_cancel", { p_id: id });
  if (error) back(page(id), "error", explain(locale, error));
  back("/invest/mine", "ok", t("أُلغي طلب المعاينة.", "The inspection request was cancelled."));
}

// ── صاحب الأرض ───────────────────────────────────────────────────────────────

export async function decideInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const accept = str(fd, "accept") === "true";
  const { error } = await supabase.rpc("land_inspection_owner_decide", {
    p_id: str(fd, "inspection_id"),
    p_accept: accept,
  });
  if (error) back("/lands", "error", explain(locale, error));
  back(
    "/lands",
    "ok",
    accept
      ? t(
          "وافقتَ على المعاينة. يتواصل معك المفتّش ليحدّد موعد الزيارة — والمستثمر لا يعرف اسمك ولا موقع أرضك.",
          "You agreed to the inspection. The inspector will contact you to set a visit — the investor still does not know your name or where the land is.",
        )
      : t("اعتذرتَ عن المعاينة، ووصل المستثمرَ إشعار.", "You declined the inspection, and the investor was notified."),
  );
}

export async function replyToInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "inspection_id");
  const { error } = await supabase.rpc("land_inspection_owner_reply", {
    p_id: id,
    p_text: str(fd, "reply").slice(0, 1000),
  });
  if (error) back(page(id), "error", explain(locale, error));
  back(page(id), "ok", t("حُفظ ردّك تحت التقرير، ووصل المستثمرَ إشعار.", "Your reply is saved beneath the report, and the investor was notified."));
}

// ── المفتّش ──────────────────────────────────────────────────────────────────

/** Called by the upload widget once the photo is in the inspector's own folder. */
export async function addInspectionPhoto(args: {
  inspectionId: string;
  storagePath: string;
  caption: string;
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const { supabase, user } = await signedIn();
  const { locale, t } = await translator();
  if (!args.storagePath.startsWith(`${user.id}/inspections/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: t("لم نجد الصورة المرفوعة. أعد رفعها.", "We could not find the uploaded photo. Upload it again."),
    };
  }
  const photo = sanitisePhotoMetadata(args.metadata);
  const { error } = await supabase.rpc("land_inspection_add_photo", {
    p_id: args.inspectionId,
    p_path: args.storagePath,
    p_caption: args.caption.slice(0, 200),
    p_captured_at: photo.capturedAt,
    p_latitude: photo.latitude,
    p_longitude: photo.longitude,
  });
  if (error) return { ok: false, message: explain(locale, error) };
  revalidatePath(page(args.inspectionId));
  return { ok: true };
}

export async function removeInspectionPhoto(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "inspection_id");
  const { error } = await supabase.rpc("land_inspection_remove_photo", { p_photo: str(fd, "photo_id") });
  if (error) back(page(id), "error", explain(locale, error));
  back(page(id), "ok", t("حُذفت الصورة من التقرير.", "The photo was removed from the report."));
}

export async function submitInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "inspection_id");
  const verdict = str(fd, "verdict");
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    back(page(id), "error", t("اختر خلاصة التقرير.", "Choose the report's verdict."));
  }
  const findings = fd
    .getAll("check")
    .map(String)
    .filter((k) => (INSPECTION_CHECKS as readonly string[]).includes(k))
    .map((k) => {
      const result = str(fd, `result_${k}`);
      return {
        key: k,
        result: (RESULTS as readonly string[]).includes(result) ? result : "",
        note: str(fd, `note_${k}`).slice(0, 500),
      };
    });
  const { data, error } = await supabase.rpc("land_inspection_submit", {
    p_id: id,
    p_verdict: verdict,
    p_findings: findings,
    p_summary: str(fd, "summary").slice(0, 3000),
    p_measured: numOrNull(fd, "measured_feddans"),
    p_independent: str(fd, "independent") === "yes",
  });
  if (error) back(page(id), "error", explain(locale, error));
  back(
    page(id),
    "ok",
    t(
      `أُرسل التقرير وأُقفل برقم ${data}. وصل المستثمرَ وصاحبَ الأرض إشعار.`,
      `The report was sent and sealed under ${data}. The investor and the owner were notified.`,
    ),
  );
}

// ── الإدارة ──────────────────────────────────────────────────────────────────

export async function setInspectionFee(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const amount = numOrNull(fd, "amount");
  const { error } = await supabase.rpc("platform_fee_set", { p_key: "land_inspection", p_amount: amount });
  if (error) back("/admin/inspections", "error", explain(locale, error));
  back(
    "/admin/inspections",
    "ok",
    amount === null
      ? t("صارت المعاينة مجّانيّة للطلبات الجديدة.", "Inspections are now free for new requests.")
      : t("حُفظ الأجر للطلبات الجديدة. الطلبات السابقة تبقى على أجرها يوم طُلبت.", "The fee is saved for new requests. Earlier requests keep the fee of the day they were made."),
  );
}

export async function markInspectionPaid(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("land_inspection_mark_paid", { p_id: str(fd, "inspection_id") });
  if (error) back("/admin/inspections", "error", explain(locale, error));
  back("/admin/inspections", "ok", t("سُجِّل وصول الأجر. أسند المعاينة الآن.", "The fee is recorded as received. Assign the inspection now."));
}

export async function assignInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("land_inspection_assign", {
    p_id: str(fd, "inspection_id"),
    p_inspector: str(fd, "inspector_id") || null,
    p_visit_on: str(fd, "visit_on") || null,
  });
  if (error) back("/admin/inspections", "error", explain(locale, error));
  back("/admin/inspections", "ok", t("أُسندت المعاينة، ووصل المفتّشَ والطرفين إشعار.", "The inspection was assigned; the inspector and both parties were notified."));
}

export async function cancelInspectionAsAdmin(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("land_inspection_admin_cancel", {
    p_id: str(fd, "inspection_id"),
    p_reason: str(fd, "reason").slice(0, 300),
  });
  if (error) back("/admin/inspections", "error", explain(locale, error));
  back("/admin/inspections", "ok", t("أُلغيت المعاينة، ووصل المستثمرَ السبب.", "The inspection was cancelled and the investor was told why."));
}

