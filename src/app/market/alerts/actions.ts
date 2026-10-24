"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbText } from "@/lib/dbText";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { currentFx, currentMarketPrices } from "@/lib/livePrices";
import { alreadyPast, figureFor, figuresOf, parseSubject, MAX_ACTIVE_ALERTS, type AlertDirection } from "@/lib/priceAlerts";
import { money } from "@/lib/marketCrops";

export interface AlertResult {
  ok: boolean;
  message: string;
}

const DIRECTIONS: AlertDirection[] = ["above", "below"];

/** «تنبيهُ سعرٍ» (البند ١٦٦): يضيف حدّاً فوق السعر أو تحته لصاحب الجلسة. */
export async function createPriceAlert(_prev: AlertResult | null, formData: FormData): Promise<AlertResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/market/alerts"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const subject = parseSubject(String(formData.get("subject") ?? ""));
  const direction = String(formData.get("direction") ?? "") as AlertDirection;
  // «600,000» and «٦٠٠٠٠٠» are both ways a person writes it.
  const raw = String(formData.get("threshold") ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[,٬\s]/g, "");
  const threshold = Number(raw);

  if (!subject) return { ok: false, message: t("اختر ما تريد متابعة سعره.", "Choose the price you want to follow.") };
  if (!DIRECTIONS.includes(direction)) return { ok: false, message: t("اختر: حين يصير السعر فوق الحدّ أو تحته.", "Choose: when the price goes above or below the limit.") };
  if (!raw || !Number.isFinite(threshold) || threshold <= 0 || threshold > 100_000_000_000) {
    return { ok: false, message: t("اكتب سعراً صحيحاً بالجنيه.", "Enter a valid price in pounds.") };
  }

  // The form refuses a limit the price is already past: it would fire on the next new figure for nothing.
  const [prices, fx] = await Promise.all([currentMarketPrices(), currentFx()]);
  const figure = figureFor(subject, figuresOf(prices, fx));
  if (!figure) {
    return { ok: false, message: t("لا يوجد سعرٌ منشور لهذا الصنف الآن، فلا يمكن متابعته.", "There is no published price for this item right now, so it cannot be followed.") };
  }
  if (alreadyPast(direction, figure.price, threshold)) {
    return {
      ok: false,
      message: t(
        `السعر الآن ${money(figure.price)} وهو ${direction === "above" ? "فوق" : "تحت"} ${money(threshold)} أصلاً. اختر حدّاً ${direction === "above" ? "أعلى" : "أدنى"} منه.`,
        `The price is already ${money(figure.price)}, ${direction === "above" ? "above" : "below"} ${money(threshold)}. Choose a limit ${direction === "above" ? "higher" : "lower"} than that.`,
      ),
    };
  }

  const { error } = await supabase.rpc("price_alert_create", {
    p_subject: subject.subject,
    p_market: subject.market,
    p_crop: subject.crop,
    p_unit: subject.unit,
    p_direction: direction,
    p_threshold: threshold,
  });
  if (error) {
    return { ok: false, message: t(`تعذّر إضافة التنبيه: ${await dbText(error.message)}`, `Could not add the alert: ${await dbText(error.message)}`) };
  }
  revalidatePath("/market/alerts");
  return {
    ok: true,
    message: t(
      `أضفنا التنبيه. سيصلك إشعارٌ حين يتجاوز آخر سعرٍ منشور هذا الحدّ (الأقصى ${MAX_ACTIVE_ALERTS} تنبيهات شغّالة).`,
      `Alert added. You will get a notification when the latest published price passes this limit (up to ${MAX_ACTIVE_ALERTS} running alerts).`,
    ),
  };
}

/** يوقف تنبيهاً شغّالاً لصاحبه؛ لا يُحذف، يبقى مسجَّلاً موقوفاً. */
export async function stopPriceAlert(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/market/alerts"));
  const id = String(formData.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(id)) await supabase.rpc("price_alert_stop", { p_id: id });
  revalidatePath("/market/alerts");
}
