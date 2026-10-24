"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SUDAN_STATES } from "@/lib/nafir";
import { normalizePhone } from "@/lib/supplyChain";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { SERVICE_BY_KEY } from "@/lib/services";
import { recordSoilEstimate } from "@/lib/landSoil";
import {
  AREA_BANDS,
  PARTNER_CROP_KEYS,
  PARTNER_KINDS,
  SOIL_CLASS_KEYS,
  WATER_SOURCES,
} from "@/lib/partners";

/**
 * Every partner step is a database function (supabase/migrations/
 * 20261017120000_partner_companies.sql) that checks who is taking it. These
 * actions carry the form there; the checks here only turn an obviously
 * incomplete form into a sentence before the round trip.
 */

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/partners", "layout");
  revalidatePath("/lands");
  revalidatePath("/admin/partners");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

const pick = (fd: FormData, k: string, allowed: readonly string[]) =>
  [...new Set(fd.getAll(k).map(String).filter((v) => allowed.includes(v)))];
const phoneOk = (p: string) => /^\+?[0-9]{7,15}$/.test(p);

// ── الشركة ──────────────────────────────────────────────────────────────────

export async function savePartner(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/partners/mine";
  const phone = normalizePhone(str(fd, "phone"));
  const whatsapp = normalizePhone(str(fd, "whatsapp"));
  const kinds = pick(fd, "kinds", PARTNER_KINDS);
  const states = pick(fd, "states", SUDAN_STATES);
  if (str(fd, "name").length < 3) back(path, "error", t("اكتب اسم الشركة.", "Enter the company name."));
  if (kinds.length === 0) back(path, "error", t("اختر ما تقدّمه شركتك.", "Choose what your company offers."));
  if (states.length === 0) back(path, "error", t("اختر الولايات التي تعمل فيها.", "Choose the states you work in."));
  if (!phoneOk(phone)) back(path, "error", t("اكتب رقم هاتفٍ صحيحاً.", "Enter a valid phone number."));
  if (whatsapp && !phoneOk(whatsapp)) back(path, "error", t("رقم واتساب غير صحيح.", "The WhatsApp number is not valid."));
  const { error } = await supabase.rpc("partner_save", {
    p_name: str(fd, "name"),
    p_commercial_registration: str(fd, "commercial_registration_no"),
    p_kinds: kinds,
    p_states: states,
    p_contact_name: str(fd, "contact_name"),
    p_phone: phone,
    p_whatsapp: whatsapp,
    p_bio: str(fd, "bio"),
  });
  if (error) back(path, "error", explain(locale, error));
  back(
    path,
    "ok",
    t(
      "حُفظت بيانات الشركة. يراجع المشرف السجلّ التجاري ثمّ تظهر شارة «موثّقة».",
      "Company details saved. An administrator will check the commercial registration, then the “Verified” badge appears.",
    ),
  );
}

export async function setPartnerActive(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_set_active", {
    p_company: str(fd, "company_id"),
    p_active: str(fd, "active") === "true",
  });
  if (error) back("/partners/mine", "error", explain(locale, error));
  back("/partners/mine", "ok", t("حُدّثت الحالة.", "Status updated."));
}

// ── الاتّفاق المبدئيّ ────────────────────────────────────────────────────────

export async function saveAgreement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/partners/mine";
  const services = [...new Set(fd.getAll("services").map(String).filter((k) => k in SERVICE_BY_KEY))];
  const from = str(fd, "valid_from");
  const until = str(fd, "valid_until");
  if (str(fd, "title").length < 5) back(path, "error", t("اكتب عنواناً للاتّفاق.", "Give the agreement a title."));
  if (services.length === 0) back(path, "error", t("اختر خدمةً واحدةً على الأقلّ.", "Choose at least one service."));
  if (str(fd, "terms").length < 20) {
    back(path, "error", t("اكتب الشروط والأسعار الإرشاديّة في سطرين على الأقلّ.", "Write the terms and indicative prices — two lines at least."));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= from) {
    back(path, "error", t("حدّد بداية الاتّفاق ونهايته، والنهاية بعد البداية.", "Set the start and end dates, the end after the start."));
  }
  const { error } = await supabase.rpc("partner_agreement_save", {
    p_id: str(fd, "agreement_id") || null,
    p_title: str(fd, "title"),
    p_states: pick(fd, "states", SUDAN_STATES),
    p_water_sources: pick(fd, "water_sources", WATER_SOURCES),
    p_soil_classes: pick(fd, "soil_classes", SOIL_CLASS_KEYS),
    p_area_bands: pick(fd, "area_bands", AREA_BANDS),
    p_crop_keys: pick(fd, "crop_keys", PARTNER_CROP_KEYS),
    p_services: services,
    p_terms: str(fd, "terms"),
    p_valid_from: from,
    p_valid_until: until,
  });
  if (error) back(path, "error", explain(locale, error));
  back(
    path,
    "ok",
    t(
      "حُفظت المسوّدة. يراجعها المشرف ويفعّلها، فتبدأ المزارع المطابقة بالظهور لك.",
      "Draft saved. An administrator will review and activate it; matching farms then start to appear for you.",
    ),
  );
}

export async function endAgreement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_agreement_end", { p_id: str(fd, "agreement_id") });
  if (error) back("/partners/mine", "error", explain(locale, error));
  back("/partners/mine", "ok", t("أُنهي الاتّفاق.", "The agreement has been ended."));
}

// ── المزارع المطابقة ─────────────────────────────────────────────────────────

export async function expressInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const path = "/partners/lands";
  if (str(fd, "message").length < 10) {
    back(path, "error", t("اكتب لصاحب الأرض ما تقترحه في سطرٍ على الأقلّ.", "Tell the landowner what you propose — a line at least."));
  }
  const { error } = await supabase.rpc("partner_express_interest", {
    p_land: str(fd, "land_id"),
    p_message: str(fd, "message"),
  });
  if (error) back(path, "error", explain(locale, error));
  back(
    path,
    "ok",
    t(
      "أُرسل الطلب. يراه صاحب الأرض في صفحة أراضيه، وإن قبله ظهرت لك بيانات التواصل هنا.",
      "Request sent. The landowner sees it on their land page; if they accept, the contact details appear for you here.",
    ),
  );
}

export async function withdrawInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("partner_interest_withdraw", { p_interest: str(fd, "interest_id") });
  if (error) back("/partners/lands", "error", explain(locale, error));
  back("/partners/lands", "ok", t("سُحب الطلب.", "Request withdrawn."));
}

// ── صاحب الأرض ───────────────────────────────────────────────────────────────

/**
 * Opens or closes a land to partner companies. The soil class is read here
 * from the national soil map at the land's own coordinates — the owner does
 * not type it — and stored with the consent so the database can match on it.
 */
export async function setLandConsent(fd: FormData) {
  const { supabase, user } = await signedIn();
  const { locale, t } = await translator();
  const landId = str(fd, "land_id");
  const open = str(fd, "open") === "true";
  const { data: land } = await supabase
    .from("lands")
    .select("latitude, longitude, crop_keys, soil_class")
    .eq("id", landId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!land) back("/lands", "error", t("ليست لك هذه الأرض.", "This land is not yours."));
  // The soil at the land's own point, not the 160 km map cell's (backlog 180). A failed read keeps what is stored.
  const estimate = open ? await recordSoilEstimate(supabase, landId, land.longitude, land.latitude) : null;
  const soil = estimate?.wrb ?? (land.soil_class as string | null) ?? null;
  // Closing to companies keeps the crops: investors read the same list on
  // /invest, and the close form sends none (backlog 129).
  const { error } = await supabase.rpc("land_set_partner_consent", {
    p_land: landId,
    p_open: open,
    p_soil_class: soil,
    p_crop_keys: open ? pick(fd, "crop_keys", PARTNER_CROP_KEYS).slice(0, 8) : ((land.crop_keys as string[] | null) ?? []),
  });
  if (error) back("/lands", "error", explain(locale, error));
  back(
    "/lands",
    "ok",
    open
      ? t(
          "فُتحت الأرض للشركات الشريكة. ترى الشركةُ المطابقة ولايتها ومحليّتها ومساحتها ومجموعتها فقط، ولا ترى اسمك ولا موقعها حتى تقبل طلبها.",
          "Your land is open to partner companies. A matching company sees only its state, locality, area and group — not your name or its location until you accept its request.",
        )
      : t("أُغلقت الأرض أمام الشركات الشريكة.", "Your land is closed to partner companies."),
  );
}

export async function decideInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const accept = str(fd, "accept") === "true";
  const { error } = await supabase.rpc("land_interest_decide", {
    p_interest: str(fd, "interest_id"),
    p_accept: accept,
  });
  if (error) back("/lands", "error", explain(locale, error));
  back(
    "/lands",
    "ok",
    accept
      ? t("قبلت الطلب. ترى الشركة الآن اسمك وهاتفك وموقع الأرض، وستتواصل معك.", "Accepted. The company now sees your name, phone and the land’s location, and will contact you.")
      : t("اعتذرت عن الطلب.", "Request declined."),
  );
}
