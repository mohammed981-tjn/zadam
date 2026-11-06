"use server";
import { dbText } from "@/lib/dbText";
import { ledgerEntryDate } from "@/lib/entryDate";
import { ledgerToday } from "@/lib/ledger/today";
import { isSettleFrom, ledgerEntryInputMessage, parseSettleRate } from "@/lib/ledgerEntryInput";
import { addStageEvidence, recordLedgerEntry, signOffStage } from "@/lib/seasonWrites";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { planSeason } from "@/lib/season";
import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from "@/lib/agronomy";
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
  if (!user) redirect(await loginHrefHere());
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
 * Records a file already uploaded to storage as evidence for a stage. Every check and the insert are
 * `addStageEvidence` (lib/seasonWrites), which the phone app's route uses too: the path must sit under this user's
 * own folder and point at a file that is there, and row-level security decides the rest.
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
  if (!user) redirect(await loginHrefHere());

  const result = await addStageEvidence(supabase, user.id, args, await getLocale());
  if (!result.ok) return result;

  revalidatePath(`/seasons/${args.seasonId}`);
  return { ok: true };
}

/**
 * Marks a stage done. The database trigger refuses if evidence is missing or an
 * earlier stage is still open, and its message is passed straight back so the
 * farmer sees the real reason rather than a generic failure. The write is
 * `signOffStage` (lib/seasonWrites), which the phone app's route uses too.
 */
export async function completeStage(formData: FormData) {
  const supabase = await createClient();
  const seasonId = str(formData, "season_id");

  const result = await signOffStage(supabase, { stageId: str(formData, "stage_id") }, await getLocale());

  revalidatePath(`/seasons/${seasonId}`);

  if (!result.ok) {
    redirect(`/seasons/${seasonId}?error=${encodeURIComponent(result.message)}`);
  }
}

/**
 * A cost or a sale. Every check and the insert are `recordLedgerEntry` (lib/seasonWrites), which the phone app's
 * route uses too, so an entry typed on the phone is read exactly as one typed here.
 */
export async function addLedgerEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const seasonId = str(formData, "season_id");
  const result = await recordLedgerEntry(
    supabase,
    user.id,
    {
      season_id: seasonId,
      category: str(formData, "category"),
      amount: str(formData, "amount"),
      currency: str(formData, "currency"),
      paid_from: str(formData, "paid_from"),
      fx_rate: str(formData, "fx_rate"),
      description: str(formData, "description"),
      entry_date: str(formData, "entry_date"),
      stage_id: str(formData, "stage_id"),
      client_key: str(formData, "client_key"),
    },
    await getLocale(),
  );

  if (!result.ok) {
    // A form with no season or an unknown item is ignored, as it always was.
    if (result.code === "invalid") return;
    redirect(`/seasons/${seasonId}?error=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/seasons/${seasonId}`);
}

/**
 * "I paid" / "I was paid" on a row kept on credit (backlog 187, 2c). The ledger books the settlement as an
 * entry of its own, and closes the exchange difference of a pound debt in the same transaction; this only
 * reads what the farmer chose and hands it over. The database checks that the row is his.
 */
export async function settleLedgerEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const seasonId = str(formData, "season_id");
  const entryId = str(formData, "entry_id");
  const from = str(formData, "paid_from");
  if (!seasonId || !entryId) return;

  const t = await translator();
  const back = (message: string) => `/seasons/${seasonId}?error=${encodeURIComponent(message)}`;

  if (!isSettleFrom(from)) {
    redirect(back(t("اختر النقد أو البنك أو المحفظة.", "Choose cash, bank or wallet.")));
  }
  const rate = parseSettleRate(str(formData, "fx_rate"));
  if (!rate.ok) {
    redirect(back(ledgerEntryInputMessage("rate", t)));
  }
  const date = ledgerEntryDate(str(formData, "settle_date"), ledgerToday());

  const { error } = await supabase.rpc("farm_settle_entry", {
    p_entry_id: entryId,
    p_from: from,
    p_date: date,
    p_rate: rate.rate === null ? null : Number(rate.rate),
  });

  if (error) {
    console.error("settleLedgerEntry failed", { seasonId, entryId, error });
    redirect(back(await dbText(error.message)));
  }

  revalidatePath(`/seasons/${seasonId}`);
}

/** Cancels a settlement: it is reversed in the ledger, and the row can then be changed or settled again. */
export async function unsettleLedgerEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const seasonId = str(formData, "season_id");
  const entryId = str(formData, "entry_id");
  if (!seasonId || !entryId) return;

  const { error } = await supabase.rpc("farm_unsettle_entry", { p_entry_id: entryId });
  if (error) {
    console.error("unsettleLedgerEntry failed", { seasonId, entryId, error });
    redirect(`/seasons/${seasonId}?error=${encodeURIComponent(await dbText(error.message))}`);
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
  if (!user) redirect(await loginHrefHere());

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
