"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATIONS } from "@/lib/agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";

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

  const name = str(formData, "name");
  const state = str(formData, "state");
  const feddans = num(formData, "feddans");
  const stationKey = str(formData, "station_key");
  const waterSource = str(formData, "water_source");
  const tenure = str(formData, "tenure");

  if (!name || !state) {
    return { ok: false, message: "اسم الأرض والولاية مطلوبان." };
  }
  if (!Number.isFinite(feddans) || feddans <= 0) {
    return { ok: false, message: "أدخل مساحة صحيحة بالفدان." };
  }
  if (!STATIONS.some((s) => s.key === stationKey)) {
    return { ok: false, message: "منطقة مناخية غير معروفة." };
  }
  if (!(waterSource in WATER_SOURCE_LABEL)) {
    return { ok: false, message: "مصدر مياه غير معروف." };
  }
  if (!TENURES.includes(tenure)) {
    return { ok: false, message: "نوع حيازة غير معروف." };
  }

  const lat = optNum(formData, "latitude");
  const lng = optNum(formData, "longitude");
  if (lat !== null && (lat < -90 || lat > 90)) {
    return { ok: false, message: "خط عرض خارج النطاق." };
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    return { ok: false, message: "خط طول خارج النطاق." };
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
    return { ok: false, message: `تعذّر تسجيل الأرض: ${error.message}` };
  }

  revalidatePath("/lands");
  return {
    ok: true,
    message:
      "سُجّلت الأرض. لن تظهر لأحد حتى ترفع مستنداتها وتعتمدها الإدارة — " +
      "إثبات الحيازة، وصور بإحداثيات، ومعاينة ميدانية.",
  };
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
    redirect(`/admin/lands?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/lands");
  revalidatePath("/lands");
}
