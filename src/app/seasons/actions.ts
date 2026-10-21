"use server";
import { dbText } from "@/lib/dbText";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planSeason, type LedgerCategory } from "@/lib/season";
import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from "@/lib/agronomy";
import { sanitisePhotoMetadata } from "@/lib/exif";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

async function translator() {
  const locale = await getLocale();
  return (ar: string, en: string) => tr(locale, ar, en);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Creates a season and writes its stage plan in one transaction-like sequence.
 *
 * The stages are generated from the FAO-56 crop model rather than typed in, so
 * the dates and the water figures are derived from the crop and the location
 * instead of guessed.
 */
export async function createSeason(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await translator();

  const name = str(formData, "name");
  const irrigation = str(formData, "irrigation") as IrrigationMethod;

  if (!name) return { ok: false, message: t("اسم الموسم مطلوب.", "The season name is required.") };
  if (!(irrigation in IRRIGATION_EFFICIENCY)) {
    return {
      ok: false,
      message: t("طريقة ري غير معروفة.", "Unknown irrigation method."),
    };
  }

  const plan = planSeason(
    str(formData, "crop_key"),
    str(formData, "station_key"),
    str(formData, "planting_date"),
    irrigation,
    num(formData, "feddans"),
    num(formData, "budget_per_feddan"),
  );

  if (!plan) {
    return {
      ok: false,
      message: t(
        "تعذّر توليد خطة الموسم — راجع المحصول والمنطقة وتاريخ الزراعة والمساحة.",
        "Could not generate the season plan — check the crop, zone, planting date and area.",
      ),
    };
  }

  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .insert({
      owner_id: user.id,
      name,
      location: str(formData, "location") || null,
      crop_key: plan.crop.key,
      station_key: plan.station.key,
      irrigation,
      feddans: plan.feddans,
      budget_per_feddan: num(formData, "budget_per_feddan"),
      planting_date: plan.plantingDate,
      harvest_date: plan.harvestDate,
      /*
       * The link that was never written.
       *
       * seasons.project_id and seasons.land_id have existed since the schema
       * was created, are typed in src/types/database.ts, and were left out of
       * this insert — so every season on the platform was created an orphan.
       * The chain the whole product depends on is investor → project → season →
       * stage: a farmer raises a season, an investor funds a project, and
       * nothing has ever joined the two. That is not a missing feature, it is a
       * column waiting to be written to, and until it is, a service contract
       * scheduled against a season binds to nothing an investor can see.
       *
       * Both stay optional. A farmer planning next season before any investor
       * exists is the normal case, not an error.
       */
      project_id: str(formData, "project_id") || null,
      land_id: str(formData, "land_id") || null,
      // A signed partnership agreement (backlog 129). seasons_links_guard
      // accepts it only from the landowner, once both have signed, on its land.
      ...(str(formData, "partnership_id") ? { partnership_id: str(formData, "partnership_id") } : {}),
    })
    .select("id")
    .single();

  if (seasonError || !season) {
    return {
      ok: false,
      message: t(
        `تعذّر إنشاء الموسم: ${await dbText(seasonError?.message)}`,
        `Could not create the season: ${await dbText(seasonError?.message)}`,
      ),
    };
  }

  const seasonId = (season as { id: string }).id;

  const { error: stagesError } = await supabase.from("season_stages").insert(
    plan.stages.map((s) => ({
      season_id: seasonId,
      stage_key: s.key,
      stage_order: s.order,
      planned_start: s.startDate,
      planned_end: s.endDate,
      planned_water_m3: s.waterM3,
      budget: s.budget,
    })),
  );

  if (stagesError) {
    // Do not leave a season with no plan behind.
    await supabase
      .from("seasons")
      .delete()
      .eq("id", seasonId)
      .then(({ error: rollbackError }) => {
        if (rollbackError) {
          console.error("season rollback failed — orphan left behind", {
            seasonId,
            rollbackError,
          });
        }
      });
    return {
      ok: false,
      message: t(
        `تعذّر حفظ مراحل الموسم: ${await dbText(stagesError.message)}`,
        `Could not save the season stages: ${await dbText(stagesError.message)}`,
      ),
    };
  }

  redirect(`/seasons/${seasonId}`);
}

/**
 * Records a file already uploaded to storage as evidence for a stage.
 *
 * The path is verified to sit under this user's own folder before it is
 * stored, so a crafted request cannot attach someone else's object — the
 * storage policy stops the upload, and this stops the reference.
 */
export async function addEvidence(args: {
  stageId: string;
  seasonId: string;
  kind: string;
  storagePath: string;
  caption: string;
  /** EXIF read in the browser before compression re-encoded the file. */
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await translator();

  if (!args.stageId || !args.storagePath) {
    return { ok: false, message: t("بيانات الدليل ناقصة.", "The evidence details are incomplete.") };
  }
  if (!["photo", "invoice", "inspection", "note"].includes(args.kind)) {
    return { ok: false, message: t("نوع دليل غير معروف.", "Unknown evidence type.") };
  }
  if (!args.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }

  // The row must point at a file that is actually there. See lib/evidenceFile
  // for why a failure to confirm is treated as a failure to upload.
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

  const { error } = await supabase.from("stage_evidence").insert({
    stage_id: args.stageId,
    kind: args.kind,
    caption: args.caption,
    storage_path: args.storagePath,
    captured_at: photo.capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    created_by: user.id,
  });

  if (error) return { ok: false, message: await dbText(error.message) };

  revalidatePath(`/seasons/${args.seasonId}`);
  return { ok: true };
}

/**
 * Marks a stage done. The database trigger refuses if evidence is missing or an
 * earlier stage is still open, and its message is passed straight back so the
 * farmer sees the real reason rather than a generic failure.
 */
export async function completeStage(formData: FormData) {
  const supabase = await createClient();
  const seasonId = str(formData, "season_id");

  const { error } = await supabase
    .from("season_stages")
    .update({
      completed: true,
      actual_end: new Date().toISOString().slice(0, 10),
    })
    .eq("id", str(formData, "stage_id"));

  revalidatePath(`/seasons/${seasonId}`);

  if (error) {
    redirect(`/seasons/${seasonId}?error=${encodeURIComponent(await dbText(error.message))}`);
  }
}

export async function addLedgerEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const seasonId = str(formData, "season_id");
  const amount = num(formData, "amount");
  const category = str(formData, "category") as LedgerCategory;

  const valid: LedgerCategory[] = [
    "seeds",
    "fertiliser",
    "pesticide",
    "labour",
    "irrigation",
    "transport",
    "other",
    "revenue",
  ];

  if (!seasonId || !valid.includes(category)) return;
  if (!Number.isFinite(amount) || amount < 0) return;

  /*
   * A ledger entry that fails silently is the worst of these: the page returns
   * as though the cost was recorded, and the book is quietly short by one line.
   * Nothing downstream can detect that later — there is no gap to find.
   */
  const { error } = await supabase.from("ledger_entries").insert({
    season_id: seasonId,
    category,
    amount,
    description: str(formData, "description") || null,
    created_by: user.id,
  });

  if (error) {
    console.error("addLedgerEntry failed", { seasonId, category, error });
    const t = await translator();
    redirect(
      `/seasons/${seasonId}?error=${encodeURIComponent(
        t(
          "تعذّر تسجيل القيد. لم يُحفظ شيء — أعد المحاولة.",
          "Could not record the entry. Nothing was saved — please try again.",
        ),
      )}`,
    );
  }

  revalidatePath(`/seasons/${seasonId}`);
}

/** Closing a season is what credits the operator's track record. */
export async function completeSeason(formData: FormData) {
  const supabase = await createClient();
  const seasonId = str(formData, "season_id");

  // الوزن المحصود اختياريّ. فراغٌ يبقى null؛ ورقمٌ غير صالح يُرفض بدل أن
  // يُحفظ صفراً — فالصفرُ ادّعاءٌ بمحصولٍ فاشل، والفراغُ مجرّد «لم يُكتب».
  const harvestRaw = str(formData, "harvest_kg");
  const harvestKg = harvestRaw === "" ? null : Number(harvestRaw);
  if (harvestKg !== null && (!Number.isFinite(harvestKg) || harvestKg < 0)) {
    const t = await translator();
    redirect(
      `/seasons/${seasonId}?error=${encodeURIComponent(
        t(
          "الوزن المحصود يجب أن يكون رقماً موجباً بالكيلوغرام، أو يُترك فارغاً.",
          "The harvested weight must be a positive number of kilograms, or left blank.",
        ),
      )}`,
    );
  }

  // Closing a season credits the operator's track record, so "did it close?"
  // has to be answerable. RLS filtering returns no error and no rows.
  const { data: closed, error } = await supabase
    .from("seasons")
    .update({ status: "completed", harvest_kg: harvestKg })
    .eq("id", seasonId)
    .select("id");

  if (error || !closed || closed.length === 0) {
    console.error("completeSeason failed", { seasonId, error });
    const t = await translator();
    redirect(
      `/seasons/${seasonId}?error=${encodeURIComponent(
        t(
          "تعذّر إقفال الموسم. تحقق من صلاحيتك ثم أعد المحاولة.",
          "Could not close the season. Check your permissions and try again.",
        ),
      )}`,
    );
  }

  revalidatePath(`/seasons/${seasonId}`);
  revalidatePath("/seasons");
}

/**
 * نشر السجلّ أو إخفاؤه — بيد صاحبه وحده.
 *
 * The flag defaults to false, so this is the only path by which a record
 * becomes public. It writes the caller's own row and nothing else: the id comes
 * from the session, never from the form, because a provider id read off a
 * submitted field is a provider id an attacker can change.
 */
export async function setPublishRecord(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const publish = str(formData, "publish") === "true";

  // RLS refusal is not an error and returns no rows, so "did it change?" has to
  // be read off the returned rows. Telling someone their record is now private
  // when the update was filtered out would be the worst possible false report
  // on this particular switch.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ publish_record: publish })
    .eq("id", user.id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    console.error("setPublishRecord failed", { userId: user.id, error });
    const t = await translator();
    redirect(
      `/seasons?error=${encodeURIComponent(
        t(
          "تعذّر حفظ التغيير. حالة سجلّك لم تتغيّر — أعد المحاولة.",
          "Could not save the change. Your record's status has not changed — please try again.",
        ),
      )}`,
    );
  }

  revalidatePath("/seasons");
  revalidatePath(`/farmers/${user.id}`);
}
