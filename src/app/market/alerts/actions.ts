"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { loginTo } from "@/lib/authEntry";
import { createPriceAlertFor, stopPriceAlertFor } from "@/lib/priceAlerts";

export interface AlertResult {
  ok: boolean;
  message: string;
}

/**
 * «تنبيهُ سعرٍ» (البند ١٦٦): يضيف حدّاً فوق السعر أو تحته لصاحب الجلسة. والفحوص والكتابة في
 * `createPriceAlertFor` (src/lib/priceAlerts.ts)، ويكتب بها تطبيق الهاتف أيضاً (البند ٢٠٣).
 */
export async function createPriceAlert(_prev: AlertResult | null, formData: FormData): Promise<AlertResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/market/alerts"));

  const result = await createPriceAlertFor(
    supabase,
    {
      subject: String(formData.get("subject") ?? ""),
      direction: String(formData.get("direction") ?? ""),
      threshold: String(formData.get("threshold") ?? ""),
    },
    await getLocale(),
  );
  if (result.ok) revalidatePath("/market/alerts");
  return result;
}

/** يوقف تنبيهاً شغّالاً لصاحبه؛ لا يُحذف، يبقى مسجَّلاً موقوفاً. */
export async function stopPriceAlert(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/market/alerts"));
  await stopPriceAlertFor(supabase, String(formData.get("id") ?? ""), await getLocale());
  revalidatePath("/market/alerts");
}
