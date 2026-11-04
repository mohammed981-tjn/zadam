"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbText } from "@/lib/dbText";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";

/**
 * إيجار الجرّار والحجز الجماعيّ (البند ١٦٨). Every action is one database function: the rules (who joins, who
 * sends, who accepts, which locality) live there and only there, so these only pass the form on and say what came back.
 */

const PAGE = "/services/machinery";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function translator() {
  const locale = await getLocale();
  return (ar: string, en: string) => tr(locale, ar, en);
}

async function signedIn(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo(path));
  return supabase;
}

function back(path: string, kind: "ok" | "error" | "message", text: string): never {
  revalidatePath(PAGE);
  revalidatePath("/services");
  revalidatePath("/services/mine");
  revalidatePath("/contracts");
  redirect(`${path}?${kind}=${encodeURIComponent(text)}`);
}

const amount = (fd: FormData) => {
  const n = Number(str(fd, "quantity"));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function openBooking(formData: FormData) {
  const supabase = await signedIn(PAGE);
  const t = await translator();
  const { error } = await supabase.rpc("machinery_booking_open", {
    p_service: str(formData, "service_id"),
    p_season: str(formData, "season_id"),
    p_quantity: amount(formData),
    p_from: str(formData, "from") || null,
    p_to: str(formData, "to") || null,
    p_name: str(formData, "display_name"),
  });
  if (error) back(PAGE, "error", await dbText(error.message));
  back(
    PAGE,
    "ok",
    t(
      "فُتح الحجز، وعُرض عقدك على مقدّم الخدمة. يراه الآن جيرانك في المحليّة لينضمّوا إليه.",
      "The booking is open and your contract is offered to the provider. Your neighbours in the locality can now join it.",
    ),
  );
}

export async function joinBooking(formData: FormData) {
  const supabase = await signedIn(PAGE);
  const t = await translator();
  const { error } = await supabase.rpc("machinery_booking_join", {
    p_booking: str(formData, "booking_id"),
    p_season: str(formData, "season_id"),
    p_quantity: amount(formData),
    p_name: str(formData, "display_name"),
  });
  if (error) back(PAGE, "error", await dbText(error.message));
  back(PAGE, "ok", t("انضممت إلى الحجز، وعُرض عقدك على مقدّم الخدمة.", "You joined the booking and your contract is offered to the provider."));
}

export async function leaveBooking(formData: FormData) {
  const supabase = await signedIn(PAGE);
  const t = await translator();
  const { error } = await supabase.rpc("machinery_booking_leave", { p_booking: str(formData, "booking_id") });
  if (error) back(PAGE, "error", await dbText(error.message));
  back(PAGE, "ok", t("انسحبت من الحجز، وأُلغي عرض عقدك.", "You left the booking and your contract offer was withdrawn."));
}

export async function requestBooking(formData: FormData) {
  const supabase = await signedIn(PAGE);
  const t = await translator();
  const { error } = await supabase.rpc("machinery_booking_request", { p_booking: str(formData, "booking_id") });
  if (error) back(PAGE, "error", await dbText(error.message));
  back(PAGE, "ok", t("أُرسل الحجز إلى مقدّم الخدمة ليقبله أو يعتذر عنه.", "The booking was sent to the provider to accept or decline."));
}

export async function decideBooking(formData: FormData) {
  const supabase = await signedIn(PAGE);
  const t = await translator();
  const accept = str(formData, "accept") === "true";
  const { error } = await supabase.rpc("machinery_booking_decide", {
    p_booking: str(formData, "booking_id"),
    p_accept: accept,
    p_reason: accept ? null : str(formData, "reason"),
  });
  if (error) back(PAGE, "error", await dbText(error.message));
  back(
    PAGE,
    "ok",
    accept
      ? t(
          "قبلت الحجز: عقود المزارعين سارية الآن، وتجدها في صفحة العقود.",
          "You accepted the booking: the farmers' contracts are in force and are on your contracts page.",
        )
      : t("اعتذرت عن الحجز، ووصل سببك إلى المزارعين.", "You declined the booking and the farmers can read your reason."),
  );
}

export async function confirmAvailability(formData: FormData) {
  const supabase = await signedIn("/services/mine");
  const t = await translator();
  const available = str(formData, "available") === "true";
  const { error } = await supabase.rpc("provider_confirm_availability", {
    p_provider: str(formData, "provider_id"),
    p_available: available,
  });
  if (error) back("/services/mine", "error", await dbText(error.message));
  back(
    "/services/mine",
    "message",
    available
      ? t(
          "أكّدت أنّك متوفّر اليوم. أكّد من جديد كلّ أسبوعين ليبقى الحجز عليك مفتوحاً.",
          "You confirmed you are available today. Confirm again every two weeks to stay open for bookings.",
        )
      : t(
          "سُجّل أنّك غير متوفّر الآن؛ لا يُفتح عليك حجزٌ جديد حتى تؤكّد توفّرك.",
          "Recorded that you are not available; no new booking opens on you until you confirm.",
        ),
  );
}
