"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbMessage } from "@/lib/dbMessages";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { OFFER_UNITS, isNotYetCreated, type OfferUnit } from "@/lib/marketOffers";
import { SUDAN_STATES } from "@/lib/nafir";
import { toE164, toWesternDigits } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";

/**
 * Both steps are database functions (supabase/migrations/
 * 20261012120000_market_offers.sql) that check who is taking them; these
 * actions check the fields first, so a refusal reads as a sentence about the
 * field and not as a Postgres constraint name, and carry the result back as
 * ?ok= / ?error=.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** A positive number from what was typed: Arabic digits and thousands separators allowed. */
const num = (fd: FormData, k: string) => {
  const s = toWesternDigits(str(fd, k)).replace(/[,\s٬]/g, "").replace("٫", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/market/offers", "layout");
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  return { supabase, locale, t: (ar: string, en: string) => tr(locale, ar, en) };
}

export async function createOffer(fd: FormData) {
  const { supabase, locale, t } = await session();
  const NEW = "/market/offers/new";
  const kind = str(fd, "kind");
  const unit = str(fd, "unit") as OfferUnit;
  const state = str(fd, "state");
  const crop = str(fd, "crop");
  const quantity = num(fd, "quantity");
  const priceSdg = num(fd, "price_sdg");
  const priceUsd = num(fd, "price_usd");
  const days = Number(str(fd, "days")) || 30;

  if (kind !== "sell" && kind !== "buy") back(NEW, "error", t("اختر: بيع أم شراء.", "Choose: selling or buying."));
  if (crop.length < 2 || crop.length > 60) back(NEW, "error", t("اكتب اسم المحصول.", "Enter the crop."));
  if (quantity === null || Number.isNaN(quantity) || quantity > 1_000_000)
    back(NEW, "error", t("الكمية عددٌ أكبر من صفر.", "The quantity must be a number greater than zero."));
  if (!OFFER_UNITS.includes(unit)) back(NEW, "error", t("اختر الوحدة.", "Choose the unit."));
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back(NEW, "error", t("اختر الولاية.", "Choose the state."));
  if (str(fd, "locality").length < 2) back(NEW, "error", t("اكتب المحلية أو السوق.", "Enter the locality or market."));
  if (Number.isNaN(priceSdg) || Number.isNaN(priceUsd))
    back(NEW, "error", t("السعر عددٌ أكبر من صفر، أو اتركه فارغاً.", "A price must be a number greater than zero, or left empty."));
  if (str(fd, "agree") !== "1")
    back(NEW, "error", t("اقرأ التنبيه ووافق عليه قبل النشر.", "Read the notice and agree to it before publishing."));

  const phone = toE164(str(fd, "dial_code"), str(fd, "phone"), locale);
  if (!phone.ok) back(NEW, "error", phone.message);

  const { error } = await supabase.rpc("market_offer_create", {
    p_kind: kind,
    p_crop: crop,
    p_quantity: quantity,
    p_unit: unit,
    p_grade: str(fd, "grade"),
    p_state: state,
    p_locality: str(fd, "locality"),
    p_price_sdg: priceSdg,
    p_price_usd: priceUsd,
    p_phone: phone.e164,
    p_whatsapp: str(fd, "whatsapp") === "1",
    p_notes: str(fd, "notes"),
    p_days: days,
  });
  if (error) {
    if (isNotYetCreated(error)) back(NEW, "error", t("نشر العروض يُفعَّل قريباً.", "Publishing offers opens soon."));
    back(
      NEW,
      "error",
      /[؀-ۿ]/.test(error.message)
        ? dbMessage(error.message, locale)
        : t("تعذّر النشر. راجع الحقول وأعد المحاولة.", "Publishing failed. Check the fields and try again."),
    );
  }
  back("/market/offers", "ok", t("نُشر عرضك. يبقى ظاهراً حتى تغلقه أو تنتهي مدّته.", "Your offer is published. It stays up until you close it or it expires."));
}

export async function closeOffer(fd: FormData) {
  const { supabase, locale, t } = await session();
  const { error } = await supabase.rpc("market_offer_close", { p_offer: str(fd, "offer_id") });
  if (error) {
    back(
      "/market/offers",
      "error",
      isNotYetCreated(error)
        ? t("العروض تُفعَّل قريباً.", "Offers open soon.")
        : /[؀-ۿ]/.test(error.message)
          ? dbMessage(error.message, locale)
          : t("تعذّر الإغلاق.", "Closing failed."),
    );
  }
  back("/market/offers", "ok", t("أُغلق العرض.", "The offer is closed."));
}
