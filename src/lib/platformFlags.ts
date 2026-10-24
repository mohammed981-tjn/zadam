/**
 * مفاتيح المنصّة تُقرأ من القاعدة (البند ١٥٨).
 *
 * `INVESTMENT_LIVE` was a TypeScript constant, so the database could not know
 * it, and a forged insert into `investments` went past it. The switch is now
 * a row in `platform_flags`, which the trigger on `investments` reads too: one
 * switch, one place. It fails closed — a missing row, a failed read, anything
 * but `enabled = true` is «not live».
 *
 * Turning it on is the owner's decision and is done in the Supabase SQL editor:
 *
 *   update platform_flags set enabled = true, updated_at = now() where key = 'investment_live';
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function investmentLive(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("platform_flags")
    .select("enabled")
    .eq("key", "investment_live")
    .maybeSingle();
  if (error) {
    console.error("platform_flags read failed — treating investment as not live", error);
    return false;
  }
  return (data as { enabled: boolean } | null)?.enabled === true;
}
