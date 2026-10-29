"use server";
import { dbText } from "@/lib/dbText";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminState } from "@/lib/adminGuard";
import { type WaterSource } from "@/lib/risk";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { locationMessage, locationProblem, parseCoordinates } from "@/lib/landLocation";
import { testProblem } from "@/lib/landTests";
import { landInputProblem } from "@/lib/landInput";
import { recordSoilEstimate } from "@/lib/landSoil";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));
const optNum = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? "").trim();
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

export interface LandResult {
  ok: boolean;
  message: string;
}

/**
 * Registers a plot. It is stored unverified and unlisted whatever the form
 * says — the database trigger enforces that independently — so a farmer can
 * describe their land freely without any of it reaching the public until an
 * admin has checked the papers.
 */
export async function registerLand(
  _prev: LandResult | null,
  formData: FormData,
): Promise<LandResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const name = str(formData, "name");
  const state = str(formData, "state");
  const feddans = num(formData, "feddans");
  const stationKey = str(formData, "station_key");
  const waterSource = str(formData, "water_source");
  const tenure = str(formData, "tenure");

  const lat = optNum(formData, "latitude");
  const lng = optNum(formData, "longitude");
  const problem = landInputProblem(
    { name, state, feddans, stationKey, waterSource, tenure, latitude: lat, longitude: lng },
    t,
  );
  if (problem) return { ok: false, message: problem };

  // وضع الوكيل (البند ١٦٩): a company registers the land in its farmer's name. The policy admits the row only under an
  // active mandate that covers lands, and the database logs it and tells the farmer; here it only names the owner.
  const forFarmer = str(formData, "for_farmer");
  const owner = /^[0-9a-f-]{36}$/.test(forFarmer) ? forFarmer : user.id;

  const { error } = await supabase.from("lands").insert({
    owner_id: owner,
    name,
    state,
    locality: str(formData, "locality") || null,
    village: str(formData, "village") || null,
    latitude: lat,
    longitude: lng,
    feddans,
    station_key: stationKey,
    water_source: waterSource as WaterSource,
    water_per_feddan: optNum(formData, "water_per_feddan"),
    soil_note: str(formData, "soil_note") || null,
    previous_crops: str(formData, "previous_crops") || null,
    km_to_market: optNum(formData, "km_to_market"),
    tenure,
    documents_on_file: 0,
    documents_required: 3,
    verification: "submitted",
    listed: false,
  });

  if (error) {
    return { ok: false, message: t(
        `تعذّر تسجيل الأرض: ${await dbText(error.message)}`,
        `Could not register the land: ${await dbText(error.message)}`,
      ), };
  }

  revalidatePath("/lands");
  if (owner !== user.id) {
    revalidatePath(`/agent/${owner}`);
    return {
      ok: true,
      message: t(
        "سُجّلت الأرض باسم المزارع، وأُخبر بها. ارفع مستنداتها من صفحته في «مزارعيّ»، ولن تظهر لأحدٍ حتى تعتمدها الإدارة.",
        "The land is registered in the farmer's name, and they have been told. Upload its documents from their page under «My farmers»; no one sees it until the administrators approve it.",
      ),
    };
  }
  return {
    ok: true,
    message: t(
      "سُجّلت الأرض. لن تظهر لأحد حتى ترفع مستنداتها وتعتمدها الإدارة — " +
        "إثبات الحيازة، وصور بإحداثيات، ومعاينة ميدانية.",
      "Your land is registered. No one will see it until you upload its documents and the administrators approve it — " +
        "proof of tenure, photos with coordinates, and a field inspection.",
    ),
  };
}

/**
 * موقع الأرض بعد تسجيلها (BUG-13 وMAP-3، البند ١٦٢): يُضاف لأرضٍ سُجّلت بلا موقع، أو يُصحَّح.
 *
 * Three ways to say it, in this order: a pasted pair or map link, the phone's own reading, two typed
 * numbers. The database already reopens a verified land for review when its place changes
 * (reopen_land_on_fact_change), and tells the owner; so this only has to check the pair is in Sudan.
 * Only the owner's own row is touched, whatever land_id the form carries.
 */
export async function setLandLocation(
  _prev: LandResult | null,
  formData: FormData,
): Promise<LandResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const landId = str(formData, "land_id");
  const pasted = parseCoordinates(str(formData, "paste"));
  const gpsLat = optNum(formData, "lat");
  const gpsLng = optNum(formData, "lng");
  const lat = pasted ? pasted.lat : gpsLat !== null && gpsLng !== null ? gpsLat : optNum(formData, "latitude");
  const lng = pasted ? pasted.lng : gpsLat !== null && gpsLng !== null ? gpsLng : optNum(formData, "longitude");

  if (lat === null || lng === null) {
    return {
      ok: false,
      message: t(
        "اضغط «حدّد موقعي»، أو الصق الموقع، أو اكتب خطّ العرض وخطّ الطول.",
        "Press “Use my location”, paste the location, or type latitude and longitude.",
      ),
    };
  }
  const problem = locationProblem(lat, lng);
  if (problem) return { ok: false, message: locationMessage(problem, t) };

  const { data, error } = await supabase
    .from("lands")
    .update({ latitude: lat, longitude: lng })
    .eq("id", landId)
    .eq("owner_id", user.id)
    .select("id, verification")
    .maybeSingle();
  if (error) {
    return { ok: false, message: t(`تعذّر حفظ الموقع: ${await dbText(error.message)}`, `Could not save the location: ${await dbText(error.message)}`) };
  }
  if (!data) {
    return { ok: false, message: t("الأرض غير موجودة أو ليست لك.", "That land does not exist or is not yours.") };
  }

  // The soil at the land's own point (backlog 180). A failed read changes nothing and says nothing.
  const soil = await recordSoilEstimate(user.id, landId, lng, lat);
  const soilName = soil ? (locale === "en" ? wrbShortEn(soil.wrb) : wrbShort(soil.wrb)) : null;

  revalidatePath("/lands");
  return {
    ok: true,
    message:
      t(
        "حُفظ الموقع. وإن كانت أرضك موثّقة فتغيير موقعها يعيدها إلى مراجعة الإدارة قبل أن تُعرض من جديد.",
        "The location is saved. If your land was verified, changing its place sends it back to the administrators before it is shown again.",
      ) +
      (soilName
        ? " " +
          t(
            `قرأنا تربة موقعك من الأقمار: ${soilName} (احتمال ${soil!.probability}٪). هذا تقدير لا فحص، ويبقى فحص الماء والتربة عندك هو الأصل.`,
            `We read the soil at your location from satellites: ${soilName} (${soil!.probability}% probability). It is an estimate, not a test; your own water and soil test is what counts.`,
          )
        : ""),
  };
}

/**
 * ردُّ الأرض إلى صاحبها بسبب.
 *
 * WHY A VERIFICATION SCREEN NEEDS THIS
 *
 * `verifyLand` alone makes the reviewer a rubber stamp: the only button
 * approves, so the only way to decline is to leave the plot in `submitted`
 * forever — which the farmer reads as silence, not as an answer. Silence is the
 * worst outcome for the person waiting, because there is nothing to act on.
 *
 * So a refusal carries a written reason, in the same column the farmer's screen
 * already renders, and the plot moves to `rejected` rather than staying in a
 * queue nobody will look at twice.
 */
export async function rejectLand(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The database's answer, second factor included (AUTH-04): without it the update below would match no row and
  // say nothing.
  const state = await adminState(supabase, user.id);
  if (state === "needs_second_factor") redirect("/admin");
  if (state !== "ok") return;

  const id = str(formData, "id");
  const note = str(formData, "verification_note");

  // سببٌ فارغٌ ليس رفضاً — هو صمتٌ يحمل ختماً. والمزارعُ لا يستطيع إصلاح
  // «مرفوضة» بلا كلمة.
  if (note.length < 10) {
    redirect(
      `/admin/lands?error=${encodeURIComponent("اكتب سبب الردّ — عشرة أحرف على الأقل، فالمزارع يصلح على أساسه.")}`,
    );
  }

  const { error } = await supabase
    .from("lands")
    .update({ verification: "rejected", listed: false, verification_note: note })
    .eq("id", id);

  if (error) {
    redirect(`/admin/lands?error=${encodeURIComponent(await dbText(error.message))}`);
  }

  revalidatePath("/admin/lands");
  revalidatePath("/lands");
}

/** Admin verification. The trigger re-checks documents before anything lists. */
export async function verifyLand(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The database's answer, second factor included (AUTH-04): without it the update below would match no row and
  // say nothing.
  const state = await adminState(supabase, user.id);
  if (state === "needs_second_factor") redirect("/admin");
  if (state !== "ok") return;

  const id = str(formData, "id");
  const documents = num(formData, "documents_on_file");

  const { error } = await supabase
    .from("lands")
    .update({
      documents_on_file: Number.isFinite(documents) ? documents : 0,
      verification: "verified",
      listed: true,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/lands?error=${encodeURIComponent(await dbText(error.message))}`);
  }

  revalidatePath("/admin/lands");
  revalidatePath("/lands");
}

/**
 * فحصٌ جديد لماء الأرض أو تربتها (البند ١٦٤). الأرقام كما كُتبت؛ وحدود الجدول تتحقّق منها ثانيةً.
 */
export async function addLandTest(
  _prev: LandResult | null,
  formData: FormData,
): Promise<LandResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const landId = str(formData, "land_id");
  const input = {
    kind: str(formData, "kind"),
    testedOn: str(formData, "tested_on"),
    ec: optNum(formData, "ec_dsm"),
    ph: optNum(formData, "ph"),
    sar: optNum(formData, "sar"),
    organic: optNum(formData, "organic_matter_pct"),
  };
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

  const lab = str(formData, "lab");
  const note = str(formData, "note");
  const { error } = await supabase.from("land_tests").insert({
    land_id: landId,
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
    return { ok: false, message: t(`تعذّر حفظ الفحص: ${await dbText(error.message)}`, `Could not save the test: ${await dbText(error.message)}`) };
  }
  revalidatePath(`/lands/${landId}`);
  return { ok: true, message: t("حُفظ الفحص.", "The test is saved.") };
}

/** حذف فحصٍ كُتب خطأً: لصاحبه خلال ساعة من كتابته (والمدير متى شاء)، والقاعدة تقرّر. */
export async function deleteLandTest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const landId = str(formData, "land_id");
  await supabase.from("land_tests").delete().eq("id", str(formData, "test_id"));
  revalidatePath(`/lands/${landId}`);
}
