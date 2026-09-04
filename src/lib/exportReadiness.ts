/**
 * جاهزيّةُ العرض — قراءةُ الرقم الذي تحسبه القاعدة، لا حسابُه هنا.
 *
 * WHY NOTHING IS COMPUTED IN THIS FILE
 *
 * `export_offer_readiness` runs `security definer` and holds its own barrier:
 * the caller sees an offer's readiness only if they own it, it is published, or
 * they administer the platform. Re-deriving the score in TypeScript from rows
 * fetched separately would mean two answers that can disagree, and the one on
 * screen would be the one nobody tested.
 *
 * So this module fetches and labels. The arithmetic, the barrier and the weights
 * are in 20260904230000_export_readiness.sql, and a gate on a real PostgreSQL
 * proves each of them guards something.
 *
 * WHY `source: "none"` IS NOT AN ERROR
 *
 * The function answers a caller who may not see the offer with an empty
 * requirement list — deliberately, so it cannot be used to enumerate other
 * people's drafts by guessing ids. That reaches here as `none`, and the screens
 * render nothing rather than "٠٪", which would be a claim about an offer we were
 * not allowed to look at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportOfferReadiness } from "@/types/database";

export type { ExportOfferReadiness } from "@/types/database";

/** What each `mode` is called on screen. Mirrors the seeded weight rows. */
export const READINESS_MODE_LABEL: Record<string, string> = {
  required: "إلزامي",
  conditional: "مشروط",
  recommended: "مُستحسَن",
};

/**
 * Where the requirement list came from, said plainly.
 *
 * The distinction matters to the farmer: a draft is measured against today's
 * rules and those can still move under it, while a submitted offer is measured
 * against the copy frozen the day it was sent — which is the promise that a rule
 * changed next month cannot retroactively fail it.
 */
export const READINESS_SOURCE_NOTE: Record<string, string> = {
  live: "محسوبةٌ على قواعد الممرّ اليوم — وقد تتغيّر قبل أن تُرسل. وبالإرسال تُجمَّد.",
  frozen: "محسوبةٌ على القواعد المجمَّدة لحظةَ الإرسال — لا تتغيّر بتغيّر اللوائح بعدها.",
};

/**
 * The one-line verdict.
 *
 * `ready` and `score` answer different questions and the sentence has to keep
 * them apart: ninety-three percent with a required certificate missing is not
 * "almost shippable", it is not shippable. So the missing count leads whenever
 * there is one, and the percentage never stands alone as the headline.
 */
export function readinessVerdict(r: ExportOfferReadiness): string {
  if (r.source === "none") return "لا بيانات.";
  if (r.required_total === 0) {
    return "لا مستنداتِ إلزاميّةً على هذا الممرّ.";
  }
  if (r.ready) {
    return r.missing.length === 0
      ? "جاهزٌ للشحن — واكتمل المستحسَنُ أيضاً."
      : `جاهزٌ للشحن — والإلزاميُّ كامل (${r.required_met}/${r.required_total}).`;
  }
  const short = r.required_total - r.required_met;
  return `غيرُ جاهز — ينقصه ${short} من ${r.required_total} مستنداً إلزاميّاً.`;
}

/**
 * Reads the summary for one offer.
 *
 * Returns null when the row is unreadable rather than a zeroed object: a screen
 * that renders "٠٪" for an offer it could not read is stating a fact it does not
 * have.
 */
export async function fetchReadiness(
  supabase: SupabaseClient,
  offerId: string,
): Promise<ExportOfferReadiness | null> {
  const { data, error } = await supabase
    .rpc("export_offer_readiness", { p_offer_id: offerId })
    .maybeSingle();

  if (error) {
    console.error("export: readiness read failed", offerId, error);
    return null;
  }
  const row = data as ExportOfferReadiness | null;
  if (!row || row.source === "none") return null;
  return row;
}
