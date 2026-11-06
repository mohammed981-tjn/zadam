import type { SupabaseClient } from "@supabase/supabase-js";
import { setInvestorConsent } from "@/lib/investSteps";
import { tr, type Locale } from "@/lib/i18n";
import { dbMessage } from "@/lib/dbMessages";
import { explain } from "@/lib/supplyActions";
import { recordSoilEstimate } from "@/lib/landSoil";
import { INVESTOR_MODELS } from "@/lib/investors";
import { PARTNER_CROP_KEYS } from "@/lib/partners";
import { testProblem } from "@/lib/landTests";
import { LAND_DOCUMENT_KINDS } from "@/lib/landDocuments";
import { evidenceFileExists } from "@/lib/evidenceFile";
import { sanitisePhotoMetadata } from "@/lib/exif";

/**
 * What the owner of a land does on its card, once, for the website and the phone app (backlog 203).
 *
 * The website's server actions (src/app/invest/actions.ts, src/app/partners/actions.ts, src/app/lands/actions.ts)
 * used to hold these steps inline, bound to the cookie session. They now carry their form here with the cookie
 * client, and the app's routes (src/app/api/app/lands/**) carry the app's JSON here with the bearer client
 * (src/lib/supabase/bearer.ts): the same checks, the same database functions, the same words, under the same
 * row-level security. Each returns what happened in a sentence; the caller decides where to show it.
 */

export interface StepResult {
  ok: boolean;
  message: string;
}

const T = (locale: Locale) => (ar: string, en: string) => tr(locale, ar, en);

/** The partnership models a form sends, kept to the known ones and without repeats. */
export const pickInvestorModels = (raw: unknown[]): string[] => [
  ...new Set(raw.map(String).filter((m) => (INVESTOR_MODELS as readonly string[]).includes(m))),
];

/** The crops a form sends for partner companies, kept to the known ones, at most eight. */
export const pickPartnerCrops = (raw: unknown[]): string[] =>
  [...new Set(raw.map(String).filter((c) => (PARTNER_CROP_KEYS as readonly string[]).includes(c)))].slice(0, 8);

/**
 * Opens or closes a verified land to investors. The soil class is read here from the national soil map at the land's
 * own coordinates, as for partner companies — the owner does not type it. Only the owner's own row is read.
 */
export async function setLandInvestorConsent(
  supabase: SupabaseClient,
  userId: string,
  input: { landId: string; open: boolean; models: string[]; note: string },
  locale: Locale,
): Promise<StepResult> {
  // One step, not two: the website's action and the invest route already share src/lib/investSteps.ts, and the
  // land card calls the same function so the model check, the soil reading and the database call cannot drift.
  const t = T(locale);
  const result = await setInvestorConsent(supabase, userId, input, { locale, t });
  if (!result.ok) return result;
  return {
    ok: true,
    message: input.open
      ? t(
          "عُرضت أرضك في صفحة فرص الاستثمار. يرى المستثمر الولاية، وفئة المساحة (لا عدد الفدادين)، والتربة، ومصدر الماء. ولا يرى اسمك ولا المحلّيّة ولا المساحة الدقيقة ولا موقعها حتى تقبل طلبه.",
          "Your land is now on the investment opportunities page. Investors see its state, its area band (not the number of feddans), its soil and its water source. They do not see your name, the locality, the exact area or its location until you accept their request.",
        )
      : t("أُغلقت الأرض أمام المستثمرين.", "Your land is closed to investors."),
  };
}

/** The owner's answer to an investor's request on their land; the database checks the land is theirs. */
export async function decideLandInvestorInterest(
  supabase: SupabaseClient,
  input: { interestId: string; accept: boolean },
  locale: Locale,
): Promise<StepResult> {
  const t = T(locale);
  const { error } = await supabase.rpc("land_investor_decide", { p_interest: input.interestId, p_accept: input.accept });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: input.accept
      ? t(
          "قبلتَ الطلب. يرى المستثمر الآن اسمك وهاتفك وموقع الأرض، وترى هاتفه هنا. اتّفقا كتابةً قبل أيّ دفع.",
          "You accepted. The investor now sees your name, phone and the land's location, and you see their phone here. Agree in writing before any payment.",
        )
      : t("اعتذرتَ عن الطلب، ووصل المستثمرَ الجواب.", "You declined, and the investor has been told."),
  };
}

/**
 * Opens or closes a land to partner companies. The soil class is read from the land's own point and stored with the
 * consent so the database can match on it. Closing keeps the crops: investors read the same list (backlog 129).
 */
export async function setLandPartnerConsent(
  supabase: SupabaseClient,
  userId: string,
  input: { landId: string; open: boolean; cropKeys: string[] },
  locale: Locale,
): Promise<StepResult> {
  const t = T(locale);
  const { data: land } = await supabase
    .from("lands")
    .select("latitude, longitude, crop_keys, soil_class")
    .eq("id", input.landId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!land) return { ok: false, message: t("ليست لك هذه الأرض.", "This land is not yours.") };
  const estimate = input.open ? await recordSoilEstimate(userId, input.landId, land.longitude, land.latitude) : null;
  const soil = estimate?.wrb ?? (land.soil_class as string | null) ?? null;
  const { error } = await supabase.rpc("land_set_partner_consent", {
    p_land: input.landId,
    p_open: input.open,
    p_soil_class: soil,
    p_crop_keys: input.open ? pickPartnerCrops(input.cropKeys) : ((land.crop_keys as string[] | null) ?? []),
  });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: input.open
      ? t(
          "فُتحت الأرض للشركات الشريكة. ترى الشركةُ المطابقة ولايتها ومحليّتها ومساحتها ومجموعتها فقط، ولا ترى اسمك ولا موقعها حتى تقبل طلبها.",
          "Your land is open to partner companies. A matching company sees only its state, locality, area and group — not your name or its location until you accept its request.",
        )
      : t("أُغلقت الأرض أمام الشركات الشريكة.", "Your land is closed to partner companies."),
  };
}

/** The owner's answer to a partner company's request; the database checks the land is theirs. */
export async function decideLandPartnerInterest(
  supabase: SupabaseClient,
  input: { interestId: string; accept: boolean },
  locale: Locale,
): Promise<StepResult> {
  const t = T(locale);
  const { error } = await supabase.rpc("land_interest_decide", { p_interest: input.interestId, p_accept: input.accept });
  if (error) return { ok: false, message: explain(locale, error) };
  return {
    ok: true,
    message: input.accept
      ? t("قبلت الطلب. ترى الشركة الآن اسمك وهاتفك وموقع الأرض، وستتواصل معك.", "Accepted. The company now sees your name, phone and the land’s location, and will contact you.")
      : t("اعتذرت عن الطلب.", "Request declined."),
  };
}

export interface LandTestInput {
  landId: string;
  kind: string;
  testedOn: string;
  ec: number | null;
  ph: number | null;
  sar: number | null;
  organic: number | null;
  lab: string;
  note: string;
}

/** A water or soil test on the field card (backlog 164). The numbers as written; the table's limits check them again. */
export async function addLandTestStep(supabase: SupabaseClient, input: LandTestInput, locale: Locale): Promise<StepResult> {
  const t = T(locale);
  const problem = testProblem(input);
  if (problem) {
    const text: Record<string, [string, string]> = {
      kind: ["اختر ماءً أو تربة.", "Choose water or soil."],
      date: ["تاريخ الفحص غير صالح: لا قبل عام ٢٠٠٠ ولا في المستقبل.", "The test date is not valid: not before 2000 and not in the future."],
      empty: ["اكتب قيمةً واحدةً على الأقلّ (الملوحة أو الحموضة أو غيرهما).", "Enter at least one value (salinity, pH, or another)."],
      range: ["قيمةٌ خارج المدى الممكن (الحموضة بين ٠ و١٤، والملوحة والصوديوم بين ٠ و١٠٠).", "A value is outside the possible range (pH 0–14; salinity and sodium 0–100)."],
      organic_water: ["المادّة العضويّة تخصّ التربة لا الماء.", "Organic matter belongs to soil, not water."],
    };
    const [ar, en] = text[problem];
    return { ok: false, message: t(ar, en) };
  }
  const lab = input.lab.trim();
  const note = input.note.trim();
  const { error } = await supabase.from("land_tests").insert({
    land_id: input.landId,
    kind: input.kind,
    tested_on: input.testedOn,
    lab: lab ? lab.slice(0, 120) : null,
    ec_dsm: input.ec,
    ph: input.ph,
    sar: input.sar,
    organic_matter_pct: input.organic,
    note: note ? note.slice(0, 500) : null,
  });
  if (error) {
    const why = dbMessage(error.message, locale);
    return { ok: false, message: t(`تعذّر حفظ الفحص: ${why}`, `Could not save the test: ${why}`) };
  }
  return { ok: true, message: t("حُفظ الفحص.", "The test is saved.") };
}

/** A test written by mistake: its writer's within an hour (the administrator's at any time). The database decides. */
export async function deleteLandTestStep(
  supabase: SupabaseClient,
  testId: string,
  /** When given, only a test on this land (the app names the land in its route). */
  landId?: string,
): Promise<{ deleted: boolean }> {
  let q = supabase.from("land_tests").delete().eq("id", testId);
  if (landId) q = q.eq("land_id", landId);
  const { data } = await q.select("id");
  return { deleted: (data ?? []).length > 0 };
}

// القائمةُ نفسُها هي مصدرُ الحقيقة، ومنها تُشتقّ المفاتيحُ المقبولة — فلا تفترقان.
const LAND_DOCUMENT_KEYS = LAND_DOCUMENT_KINDS.map((k) => k.value);

/**
 * Records an uploaded land document — the website's «ارفع المستند» on /lands and the app's (backlog 203), each with
 * the uploader's own client. The plot's documents_on_file is not touched here — a database trigger recomputes it from
 * the stored files, so the count can never say more than the files support. Whether the land is the caller's to add
 * to is row-level security's answer.
 */
export async function addLandDocumentStep(
  supabase: SupabaseClient,
  userId: string,
  args: {
    landId: string;
    kind: string;
    storagePath: string;
    caption: string;
    /** EXIF read before the file was re-encoded (in the browser) or stripped of it (lib/appPhoto). */
    metadata?: unknown;
  },
  locale: Locale,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = T(locale);

  if (!args.landId || !args.storagePath) {
    return { ok: false, message: t("بيانات المستند ناقصة.", "The document details are incomplete.") };
  }
  if (!LAND_DOCUMENT_KEYS.includes(args.kind)) {
    return { ok: false, message: t("نوع مستند غير معروف.", "Unknown document type.") };
  }
  if (!args.storagePath.startsWith(`${userId}/`)) {
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

  // A document kept offline is sent again if the reply to its first send was lost (backlog 185): the same file on the
  // same land is the document already recorded.
  const { data: already } = await supabase
    .from("land_documents")
    .select("id")
    .eq("land_id", args.landId)
    .eq("storage_path", args.storagePath)
    .limit(1)
    .maybeSingle();
  if (already) return { ok: true };

  const photo = sanitisePhotoMetadata(args.metadata);

  const { error } = await supabase.from("land_documents").insert({
    land_id: args.landId,
    kind: args.kind,
    storage_path: args.storagePath,
    caption: args.caption,
    captured_at: photo.capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    created_by: userId,
  });

  if (error) return { ok: false, message: dbMessage(error.message, locale) };
  return { ok: true };
}
