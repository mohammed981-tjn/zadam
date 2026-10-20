"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const commodityId = str(formData, "commodity_id");
  const destinationId = str(formData, "destination_id");
  if (!commodityId || !destinationId) {
    return { ok: false, message: t("اختر المنتج والوجهة.", "Choose the product and the destination.") };
  }
  // The pair is opened on its first offer; one nobody has studied yet is
  // created without rules, and the offer page says so.
  const { data: corridorId, error: corridorError } = await supabase.rpc("export_corridor_for", {
    p_commodity: commodityId,
    p_destination: destinationId,
  });
  if (corridorError || !corridorId) {
    console.error("export: corridor lookup failed", corridorError);
    return { ok: false, message: t("تعذّر فتح طريق هذا المنتج إلى هذه الوجهة. حاول ثانية.", "Could not open this product's route to this destination. Try again.") };
  }

  const amounts = offerAmounts(
    str(formData, "quantity"),
    str(formData, "unit_price"),
    100,
  );
  if (!amounts) {
    return {
      ok: false,
      message: t(
        "الكمّية والسعر يجب أن يكونا رقمين أكبر من صفر — الكمّية بأربع خانات " +
          "عشرية على الأكثر، والسعر بخانتين.",
        "Quantity and price must be numbers greater than zero — quantity with at most four decimal places, price with two.",
      ),
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
  const originIssue = originProblem(origin, locale);
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
        message: t(
          "حدود القطعة ليست GeoJSON صالحاً. انسخها كاملةً من أداة الخرائط، " +
            "أو اتركها فارغة إن كانت القطعة دون أربعة هكتارات.",
          "The plot boundary is not valid GeoJSON. Copy it in full from the mapping tool, or leave it empty if the plot is under four hectares.",
        ),
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
      message: t("تعذّر حفظ العرض. راجع البيانات وحاول ثانية.", "The offer could not be saved. Check the details and try again."),
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
      message: t(
        "تعذّر حفظ بيانات المنشأ، فلم يُحفظ العرض. راجع الإحداثيّة.",
        "The origin details could not be saved, so the offer was not saved. Check the coordinates.",
      ),
    };
  }

  revalidatePath("/export/offers");
  return {
    ok: true,
    message: t("حُفظ العرض مسوّدة. راجعه ثم أرسله.", "The offer was saved as a draft. Review it, then send it."),
  };
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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  if (!["submitted", "draft", "withdrawn"].includes(next)) {
    return { ok: false, message: t("حالة غير معروفة.", "Unknown status.") };
  }

  const { data, error } = await supabase
    .from("export_offers")
    .update({ status: next })
    .eq("id", offerId)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    console.error("export: offer move failed", error);
    return { ok: false, message: t("تعذّر تغيير حالة العرض.", "The offer's status could not be changed.") };
  }

  // The row count, not the error, is what distinguishes a refusal here: a
  // policy that declines an update returns success and zero rows, so trusting
  // `!error` would answer "sent" over a write that never happened.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: t(
        "لم يتغيّر شيء — العرض ليس في حالةٍ تسمح بهذا الانتقال.",
        "Nothing changed — the offer is not in a state that allows this move.",
      ),
    };
  }

  revalidatePath("/export/offers");
  return {
    ok: true,
    message:
      next === "submitted"
        ? t("أُرسل العرض للمراجعة.", "The offer was sent for review.")
        : next === "withdrawn"
          ? t("سُحب العرض.", "The offer was withdrawn.")
          : t("عاد العرض مسوّدة.", "The offer is back to draft."),
  };
}
