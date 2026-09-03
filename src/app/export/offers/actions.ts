"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  offerAmounts,
  offerReference,
  originProblem,
  quantityToString,
  type OriginInput,
} from "@/lib/exportOffers";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * زرُّ «أرسل» — نصفُ المزارع من القرار.
 *
 * WHY THE FARMER PRESSES THIS AND NOT THE REVIEWER
 *
 * It is their goods, their consent and their figures. Nothing here publishes:
 * the offer stops at `submitted`, and the database — not this file — is what
 * keeps it there. The row-level policy caps what a farmer may set to
 * draft/submitted/withdrawn, so a direct POST to this endpoint with
 * `status=published` is refused by the boundary rather than by a check in
 * TypeScript that a PostgREST caller would never reach.
 *
 * The shape follows the Ethiopian commodity exchange, where a licensed grader
 * — not the seller — certifies the grade, and that certification is the whole
 * product. What it deliberately does not follow is that exchange's cost:
 * commingling into graded silos, which cost it traceability to the farmer and
 * with it the European market. Here the lot stays attached to one farmer's
 * season, which is the only thing Sudagri has that nobody else does.
 */
export async function createOffer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const corridorId = str(formData, "corridor_id");
  if (!corridorId) return { ok: false, message: "اختر السلعة والوجهة." };

  const amounts = offerAmounts(
    str(formData, "quantity"),
    str(formData, "unit_price"),
    100,
  );
  if (!amounts) {
    return {
      ok: false,
      message:
        "الكمّية والسعر يجب أن يكونا رقمين أكبر من صفر — الكمّية بأربع خانات " +
        "عشرية على الأكثر، والسعر بخانتين.",
    };
  }

  const origin: OriginInput = {
    plotRef: str(formData, "plot_ref"),
    areaHectares: str(formData, "area_hectares"),
    latitude: str(formData, "latitude"),
    longitude: str(formData, "longitude"),
    boundary: str(formData, "boundary"),
  };

  // Checked here for the message, enforced in the database for the boundary.
  // A constraint name in the browser tells a farmer nothing they can act on.
  const originIssue = originProblem(origin);
  if (originIssue) return { ok: false, message: originIssue };

  // Parsed before anything is written, because JSON.parse throws on a typo and
  // an unhandled throw in a Server Function reaches the browser as a blank
  // failure. A farmer pasting a boundary from a mapping tool will mistype it;
  // that deserves a sentence, not a crash — and certainly not a crash *after*
  // the offer row was already inserted.
  let boundary: unknown = null;
  if (origin.boundary) {
    try {
      boundary = JSON.parse(origin.boundary);
    } catch {
      return {
        ok: false,
        message:
          "حدود القطعة ليست GeoJSON صالحاً. انسخها كاملةً من أداة الخرائط، " +
          "أو اتركها فارغة إن كانت القطعة دون أربعة هكتارات.",
      };
    }
  }

  const uom = str(formData, "uom_code");
  const gradeId = str(formData, "grade_id");
  const seasonId = str(formData, "season_id");

  const { data: offer, error } = await supabase
    .from("export_offers")
    .insert({
      reference: offerReference(),
      owner_id: user.id,
      season_id: seasonId || null,
      corridor_id: corridorId,
      grade_id: gradeId || null,
      quantity: quantityToString(amounts.quantityScaled),
      // Omitted rather than sent empty: the trigger fills it from the
      // commodity's default, and an empty string is not "unset" to PostgREST.
      ...(uom ? { uom_code: uom } : {}),
      unit_price_minor: Number(amounts.unitPriceMinor),
      value_minor: Number(amounts.valueMinor),
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !offer) {
    console.error("export: offer insert failed", error);
    return {
      ok: false,
      message: "تعذّر حفظ العرض. راجع البيانات وحاول ثانية.",
    };
  }

  const { error: originError } = await supabase
    .from("export_offer_origins")
    .insert({
      offer_id: offer.id,
      plot_ref: origin.plotRef,
      area_hectares: origin.areaHectares || null,
      latitude: origin.latitude,
      longitude: origin.longitude,
      boundary,
    });

  if (originError) {
    // A consignment with no origin is one the deforestation rule cannot be
    // checked against, so the half-built offer is removed rather than left to
    // be discovered at the border. Reported if that cleanup itself fails —
    // a silent orphan is worse than a loud one.
    console.error("export: origin insert failed", originError);
    const { error: undoError } = await supabase
      .from("export_offers")
      .delete()
      .eq("id", offer.id);
    if (undoError) console.error("export: rollback failed", undoError);

    return {
      ok: false,
      message: "تعذّر حفظ بيانات المنشأ، فلم يُحفظ العرض. راجع الإحداثيّة.",
    };
  }

  revalidatePath("/export/offers");
  return { ok: true, message: "حُفظ العرض مسوّدة. راجعه ثم أرسله." };
}

/**
 * Moves an offer between the states a farmer is allowed to move it between.
 *
 * `next` is checked here against a closed list, and again by the state-machine
 * trigger, and again by the row-level policy. That is not redundancy for its
 * own sake: this one produces the message, the trigger keeps the transitions
 * lawful for every caller including PostgREST, and the policy is what actually
 * stops a farmer publishing their own goods.
 */
export async function moveOffer(
  offerId: string,
  next: "submitted" | "draft" | "withdrawn",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!["submitted", "draft", "withdrawn"].includes(next)) {
    return { ok: false, message: "حالة غير معروفة." };
  }

  const { data, error } = await supabase
    .from("export_offers")
    .update({ status: next })
    .eq("id", offerId)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    console.error("export: offer move failed", error);
    return { ok: false, message: "تعذّر تغيير حالة العرض." };
  }

  // The row count, not the error, is what distinguishes a refusal here: a
  // policy that declines an update returns success and zero rows, so trusting
  // `!error` would answer "sent" over a write that never happened.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "لم يتغيّر شيء — العرض ليس في حالةٍ تسمح بهذا الانتقال.",
    };
  }

  revalidatePath("/export/offers");
  return {
    ok: true,
    message:
      next === "submitted"
        ? "أُرسل العرض للمراجعة."
        : next === "withdrawn"
          ? "سُحب العرض."
          : "عاد العرض مسوّدة.",
  };
}
