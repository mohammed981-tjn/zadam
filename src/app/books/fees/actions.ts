"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * رسوم المنصّة على دافعها (البند ١٨٩): يؤكّد من أين دفع فيُقيَّد الرسم في دفتره ودفتر المنصّة معاً، أو يعترض بسبب.
 * The database checks the fee is his and still waiting (supabase/migrations/20261025210000_platform_fees.sql).
 */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/books/fees");
  revalidatePath("/books");
  redirect(`/books/fees?${key}=${encodeURIComponent(message)}`);
}

export async function confirmFee(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("ledger_fee_confirm", { p_fee: str(fd, "fee_id"), p_account: str(fd, "account") });
  if (error) {
    console.error("confirmFee failed", { error });
    back("error", explain(locale, error));
  }
  back("ok", t("أُكِّد الرسم وقُيِّد في دفترك ودفتر المنصّة.", "The fee was confirmed and booked in your book and the platform's."));
}

export async function rejectFee(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("ledger_fee_reject", { p_fee: str(fd, "fee_id"), p_reason: str(fd, "reason") });
  if (error) back("error", explain(locale, error));
  back("ok", t("سُجّل اعتراضك وأُبلغت الإدارة بسببه؛ ولم يُقيَّد شيء.", "Your objection was recorded and the administrators told why; nothing was booked."));
}
