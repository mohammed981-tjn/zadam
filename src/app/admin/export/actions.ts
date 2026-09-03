"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { MIN_REJECTION_REASON } from "@/lib/exportOffers";

export interface ReviewResult {
  ok: boolean;
  message: string;
}

/**
 * زرُّ «انشر» وزرُّ «أعده» — نصفُ المراجع من القرار.
 *
 * WHAT THE REVIEWER IS CERTIFYING, AND WHAT THEY ARE NOT
 *
 * Not the quality of the goods and not the price. Those belong to the farmer
 * and to the buyer's own inspection. What publishing asserts is narrower and
 * checkable: that the evidence supports the claims — the documents are present,
 * the grade matches what the pictures show, the origin coordinates are there,
 * and any licence is valid on the shipping date.
 *
 * That distinction is what keeps a "verified" badge from becoming a liability.
 * A platform that appears to guarantee quality owns the first rejected shipment.
 *
 * WHY THIS USES THE SESSION CLIENT AND NOT THE ADMIN CLIENT
 *
 * `reviewed_by` is filled from `auth.uid()` by the state-machine trigger, and
 * `export_offer_published_was_reviewed` refuses a published row that has none.
 * The service-role client carries no session, so `auth.uid()` would be null and
 * the publish would be refused — correctly, because a published offer nobody
 * signed is not a reviewed one. The verification gate caught this before any
 * screen existed; it is written down here so it is not rediscovered as a bug.
 */
export async function reviewOffer(
  offerId: string,
  decision: "publish" | "return",
  reason: string,
): Promise<ReviewResult> {
  // requireAdmin returns the session client deliberately — see above.
  const { supabase } = await requireAdmin();

  if (decision === "return") {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REJECTION_REASON) {
      return {
        ok: false,
        message:
          `اكتب سبباً لا يقلّ عن ${MIN_REJECTION_REASON} أحرف. ` +
          "المزارع سيقرأه ليصلح العرض، ورفضٌ بلا سببٍ يجعله يكرّر الخطأ نفسه.",
      };
    }
  }

  const patch =
    decision === "publish"
      ? { status: "published" as const }
      : { status: "rejected" as const, rejection_reason: reason.trim() };

  const { data, error } = await supabase
    .from("export_offers")
    .update(patch)
    .eq("id", offerId)
    // Only an offer actually awaiting review. Without this, a second reviewer
    // pressing a stale page would move an offer that has already been decided.
    .eq("status", "submitted")
    .select("id");

  if (error) {
    console.error("export: review failed", error);
    return { ok: false, message: "تعذّر تنفيذ القرار." };
  }

  // Zero rows is the answer to watch for, not the error: a policy refusal and
  // a stale page both come back as success with nothing changed.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "لم يتغيّر شيء — قد يكون العرض بُتّ فيه بالفعل. حدّث الصفحة.",
    };
  }

  revalidatePath("/admin/export");
  revalidatePath("/export/offers");
  return {
    ok: true,
    message: decision === "publish" ? "نُشر العرض." : "أُعيد العرض لصاحبه بالسبب.",
  };
}
