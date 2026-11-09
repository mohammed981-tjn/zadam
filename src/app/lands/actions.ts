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
import { addLandTestStep, deleteLandTestStep } from "@/lib/landOwnerSteps";
import { boundaryOf, landInputProblem, MAX_CORNERS, type Boundary } from "@/lib/landInput";
import { recordSoilEstimate } from "@/lib/landSoil";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { loginHrefHere } from "@/lib/loginHere";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));
const optNum = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? "").trim();
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

/**
 * The corners drawn on the website's map (`BoundaryDrawer`), as the app sends them: a JSON list of {lat, lng}.
 * Absent → null; present but not a field → "bad". The area and the centre are this server's own, from `boundaryOf`,
 * never the figure the page showed.
 */
function drawnBoundary(fd: FormData): { corners: [number, number][]; shape: Boundary } | null | "bad" {
  const raw = str(fd, "boundary");
  if (!raw) return null;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return "bad";
  }
  if (!Array.isArray(list) || list.length > MAX_CORNERS) return "bad";
  const corners = list.map((c) => ({
    lat: Number((c as { lat?: unknown } | null)?.lat),
    lng: Number((c as { lng?: unknown } | null)?.lng),
  }));
  const shape = boundaryOf(corners);
  if (!shape) return "bad";
  // Stored [lat, lng] to a decimetre, as the app's route stores them (20261031010000).
  return { corners: corners.map((c) => [Math.round(c.lat * 1e6) / 1e6, Math.round(c.lng * 1e6) / 1e6]), shape };
}

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
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const name = str(formData, "name");
  const state = str(formData, "state");
  const stationKey = str(formData, "station_key");
  const waterSource = str(formData, "water_source");
  const tenure = str(formData, "tenure");

  // The land drawn by its corners on the map (backlog 210): its area and place are the corners', as in the app.
  const drawn = drawnBoundary(formData);
  if (drawn === "bad") {
    return {
      ok: false,
      message: t(
        "النقاط على الخريطة لا تحيط بأرض. ضع ثلاث نقاطٍ على الأقلّ حول الأرض بالترتيب، أو امسحها.",
        "The points on the map do not enclose a land. Put at least three points round it in order, or clear them.",
      ),
    };
  }
  const feddans = drawn ? Math.round(drawn.shape.feddans * 100) / 100 : num(formData, "feddans");
  const lat = drawn ? Math.round(drawn.shape.centre.lat * 1e6) / 1e6 : optNum(formData, "latitude");
  const lng = drawn ? Math.round(drawn.shape.centre.lng * 1e6) / 1e6 : optNum(formData, "longitude");
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
    boundary: drawn ? drawn.corners : null,
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
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const landId = str(formData, "land_id");
  // Its corners drawn on the map come first (backlog 210): the place is then their centre.
  const drawn = drawnBoundary(formData);
  if (drawn === "bad") {
    return {
      ok: false,
      message: t(
        "النقاط على الخريطة لا تحيط بأرض. ضع ثلاث نقاطٍ على الأقلّ حول الأرض بالترتيب، أو امسحها.",
        "The points on the map do not enclose a land. Put at least three points round it in order, or clear them.",
      ),
    };
  }
  const pasted = parseCoordinates(str(formData, "paste"));
  const gpsLat = optNum(formData, "lat");
  const gpsLng = optNum(formData, "lng");
  const lat = drawn
    ? Math.round(drawn.shape.centre.lat * 1e6) / 1e6
    : pasted ? pasted.lat : gpsLat !== null && gpsLng !== null ? gpsLat : optNum(formData, "latitude");
  const lng = drawn
    ? Math.round(drawn.shape.centre.lng * 1e6) / 1e6
    : pasted ? pasted.lng : gpsLat !== null && gpsLng !== null ? gpsLng : optNum(formData, "longitude");

  if (!drawn && str(formData, "drawing")) {
    return {
      ok: false,
      message: t(
        "ضع ثلاث نقاطٍ على الأقلّ حول الأرض على الخريطة، أو ألغِ رسم الحدود واختر طريقةً أخرى.",
        "Put at least three points round the land on the map, or cancel drawing and choose another way.",
      ),
    };
  }
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
    .update(drawn ? { latitude: lat, longitude: lng, boundary: drawn.corners } : { latitude: lat, longitude: lng })
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
      (drawn
        ? " " +
          t(
            `وحُفظت حدودها: نحو ${(Math.round(drawn.shape.feddans * 100) / 100).toLocaleString("ar-SA")} فدان داخل النقاط، وتقارنها الإدارة بالمساحة المسجّلة.`,
            `Its boundary is saved too: about ${Math.round(drawn.shape.feddans * 100) / 100} feddans inside the points, which the administrators compare with the registered area.`,
          )
        : "") +
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
  if (!user) redirect(await loginHrefHere());

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
      `/admin/lands?error=${encodeURIComponent(tr(await getLocale(), "اكتب سبب الردّ — عشرة أحرف على الأقل، فالمزارع يصلح على أساسه.", "Write the reason for returning it, at least ten characters: the farmer fixes the land from it."))}`,
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
  if (!user) redirect(await loginHrefHere());

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
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const landId = str(formData, "land_id");
  // The step is shared with the phone app's field card (backlog 203): src/lib/landOwnerSteps.ts.
  const result = await addLandTestStep(
    supabase,
    {
      landId,
      kind: str(formData, "kind"),
      testedOn: str(formData, "tested_on"),
      ec: optNum(formData, "ec_dsm"),
      ph: optNum(formData, "ph"),
      sar: optNum(formData, "sar"),
      organic: optNum(formData, "organic_matter_pct"),
      lab: str(formData, "lab"),
      note: str(formData, "note"),
    },
    locale,
  );
  if (result.ok) revalidatePath(`/lands/${landId}`);
  return result;
}

/** حذف فحصٍ كُتب خطأً: لصاحبه خلال ساعة من كتابته (والمدير متى شاء)، والقاعدة تقرّر. */
export async function deleteLandTest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const landId = str(formData, "land_id");
  await deleteLandTestStep(supabase, str(formData, "test_id"));
  revalidatePath(`/lands/${landId}`);
}
