"use server";
import { dbText } from "@/lib/dbText";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATIONS } from "@/lib/agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

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

const TENURES = ["owned", "leased", "communal", "unspecified"];

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

  if (!name || !state) {
    return { ok: false, message: t("اسم الأرض والولاية مطلوبان.", "The land name and state are required.") };
  }
  if (!Number.isFinite(feddans) || feddans <= 0) {
    return { ok: false, message: t("أدخل مساحة صحيحة بالفدان.", "Enter a valid area in feddans.") };
  }
  if (!STATIONS.some((s) => s.key === stationKey)) {
    return { ok: false, message: t("منطقة مناخية غير معروفة.", "Unknown climate zone.") };
  }
  if (!(waterSource in WATER_SOURCE_LABEL)) {
    return { ok: false, message: t("مصدر مياه غير معروف.", "Unknown water source.") };
  }
  if (!TENURES.includes(tenure)) {
    return { ok: false, message: t("نوع حيازة غير معروف.", "Unknown tenure type.") };
  }

  const lat = optNum(formData, "latitude");
  const lng = optNum(formData, "longitude");
  if (lat !== null && (lat < -90 || lat > 90)) {
    return { ok: false, message: t("خط عرض خارج النطاق.", "Latitude is out of range.") };
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    return { ok: false, message: t("خط طول خارج النطاق.", "Longitude is out of range.") };
  }

  const { error } = await supabase.from("lands").insert({
    owner_id: user.id,
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") return;

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") return;

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
