import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REGION_LABEL,
  destinationRegion,
  offerAmounts,
  offerReference,
  originProblem,
  quantityToString,
  referenceName,
  type DestinationRegion,
  type OfferStatus,
  type OriginInput,
} from "@/lib/exportOffers";
import { tr, type Locale } from "@/lib/i18n";
import type { ExportCorridorRulesStatus } from "@/types/database";

/**
 * «ملفّ الصادر» as the website's /export/offers reads and writes it, in one place, so the website's pages and the phone
 * app's routes (src/app/api/app/export/**, backlog 203) list the same products and destinations, say the same about
 * which pair has been studied, and save an offer through the same checks.
 *
 * Every read here is of tables and functions the policy opens to the public (the reference tables, the corridor
 * requirements and their review log) or to the offer's owner (the offers). Every write is the signed-in person's,
 * through row-level security — nothing here holds an elevated key.
 */

export const REGION_ORDER: DestinationRegion[] = ["arab", "africa", "asia", "europe", "americas", "other"];

export interface ExportChoices {
  commodities: { id: string; code: string; label: string; defaultUom: string; hsCode: string | null }[];
  destinations: { id: string; code: string; label: string; group: string }[];
  /** Requirements on record for a pair, keyed "commodityId|destinationId"; absent means not studied. */
  studied: Record<string, number>;
  grades: { id: string; commodityId: string; name: string }[];
  uoms: { code: string; name: string }[];
}

/** The product and destination lists the offer form chooses from, the destinations grouped by region (backlog 118). */
export async function loadExportChoices(supabase: SupabaseClient, locale: Locale): Promise<ExportChoices> {
  const [{ data: commodityRows }, { data: destinationRows }, { data: corridorRows }, { data: gradeRows }, { data: uomRows }] =
    await Promise.all([
      supabase.from("export_commodities").select("id, code, name_ar, hs_code, default_uom_code").eq("active", true).order("name_ar"),
      supabase.from("export_destinations").select("id, code, name_ar").eq("active", true).order("name_ar"),
      // Which pairs have requirements on record, so the form can say so before saving.
      supabase.from("export_corridors").select("commodity_id, destination_id, export_corridor_requirements(count)"),
      supabase.from("export_commodity_grades").select("id, commodity_id, name_ar"),
      supabase.from("export_uom").select("code, name_ar"),
    ]);

  const commodities = (
    (commodityRows ?? []) as { id: string; code: string; name_ar: string; hs_code: string | null; default_uom_code: string }[]
  ).map((c) => ({ id: c.id, code: c.code, label: referenceName(c.code, c.name_ar, locale), defaultUom: c.default_uom_code, hsCode: c.hs_code }));
  const destinations = ((destinationRows ?? []) as { id: string; code: string; name_ar: string }[])
    .map((d) => {
      const region = destinationRegion(d.code);
      return {
        id: d.id,
        code: d.code,
        label: referenceName(d.code, d.name_ar, locale),
        group: locale === "en" ? REGION_LABEL[region].en : REGION_LABEL[region].ar,
        order: REGION_ORDER.indexOf(region),
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, locale))
    .map((d) => ({ id: d.id, code: d.code, label: d.label, group: d.group }));
  const studied: Record<string, number> = {};
  for (const c of (corridorRows ?? []) as {
    commodity_id: string;
    destination_id: string;
    export_corridor_requirements: { count: number }[];
  }[]) {
    const n = c.export_corridor_requirements?.[0]?.count ?? 0;
    if (n > 0) studied[`${c.commodity_id}|${c.destination_id}`] = n;
  }
  const grades = ((gradeRows ?? []) as { id: string; commodity_id: string; name_ar: string }[]).map((g) => ({
    id: g.id,
    commodityId: g.commodity_id,
    name: g.name_ar,
  }));
  const uoms = ((uomRows ?? []) as { code: string; name_ar: string }[]).map((u) => ({
    code: u.code,
    name: referenceName(u.code, u.name_ar, locale),
  }));
  return { commodities, destinations, studied, grades, uoms };
}

// ═══════════════════════════════════════════════════════════════════════════
// What one pair asks for — the corridor's dated requirements and when they were last checked
// ═══════════════════════════════════════════════════════════════════════════

export interface CorridorRequirement {
  documentTypeId: string;
  code: string;
  nameAr: string;
  noteAr: string | null;
  mode: "required" | "conditional" | "recommended";
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Where a dated rule stands on a day: in force, not yet in force, or retired. The same window the readiness function
 * applies (`effective_from <= current_date and (effective_to is null or effective_to > current_date)`,
 * 20260905140000_a_retired_rule_stops_being_asked_for.sql). Pure.
 */
export function requirementStanding(r: Pick<CorridorRequirement, "effectiveFrom" | "effectiveTo">, today: string) {
  if (r.effectiveFrom > today) return "upcoming" as const;
  if (r.effectiveTo !== null && r.effectiveTo <= today) return "retired" as const;
  return "in_force" as const;
}

const MODE_ORDER = { required: 0, conditional: 1, recommended: 2 } as const;

/**
 * The requirements on record for a product to a destination, as the corridor holds them before any offer exists:
 * the same rows an offer's readiness is measured against while it is a draft. Null `corridorId` means the pair has
 * never been opened, which is «not studied», never «nothing required» (backlog 118).
 */
export async function loadCorridorRules(supabase: SupabaseClient, commodityId: string, destinationId: string) {
  const { data: corridor } = await supabase
    .from("export_corridors")
    .select("id")
    .eq("commodity_id", commodityId)
    .eq("destination_id", destinationId)
    .maybeSingle();
  const corridorId = (corridor as { id: string } | null)?.id ?? null;
  if (!corridorId) return { corridorId: null, requirements: [] as CorridorRequirement[], rules: null };

  const [{ data: reqRows }, { data: rulesRow }] = await Promise.all([
    supabase
      .from("export_corridor_requirements")
      .select("mode, effective_from, effective_to, document:export_document_types(id, code, name_ar, note_ar)")
      .eq("corridor_id", corridorId),
    supabase.rpc("export_corridor_rules_status", { p_corridor_id: corridorId }).maybeSingle(),
  ]);
  const requirements = (
    (reqRows ?? []) as unknown as {
      mode: CorridorRequirement["mode"];
      effective_from: string;
      effective_to: string | null;
      document: { id: string; code: string; name_ar: string; note_ar: string | null } | null;
    }[]
  )
    .filter((r) => r.document)
    .map((r) => ({
      documentTypeId: r.document!.id,
      code: r.document!.code,
      nameAr: r.document!.name_ar,
      noteAr: r.document!.note_ar,
      mode: r.mode,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
    }))
    .sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || a.nameAr.localeCompare(b.nameAr, "ar"));
  return { corridorId, requirements, rules: (rulesRow as ExportCorridorRulesStatus | null) ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// The farmer's offers — saved as drafts, sent for review, withdrawn
// ═══════════════════════════════════════════════════════════════════════════

export interface MyOfferRow {
  id: string;
  reference: string;
  quantity: string;
  uom_code: string;
  unit_price_minor: number;
  value_minor: number;
  status: OfferStatus;
  rejection_reason: string | null;
  created_at: string;
  requirements_frozen_at: string | null;
  corridor_id: string;
  corridor: {
    commodity: { code: string; name_ar: string } | null;
    destination: { code: string; name_ar: string } | null;
  } | null;
}

export async function loadMyExportOffers(supabase: SupabaseClient, userId: string): Promise<MyOfferRow[]> {
  const { data } = await supabase
    .from("export_offers")
    .select(
      "id, reference, quantity, uom_code, unit_price_minor, value_minor, status, rejection_reason, created_at, " +
        "requirements_frozen_at, corridor_id, " +
        "corridor:export_corridors(commodity:export_commodities(code, name_ar), destination:export_destinations(code, name_ar))",
    )
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as MyOfferRow[];
}

export interface ExportOfferInput {
  commodityId: string;
  destinationId: string;
  quantity: string;
  unitPrice: string;
  plotRef: string;
  areaHectares: string;
  latitude: string;
  longitude: string;
  boundary: string;
  uom: string;
  gradeId: string;
  seasonId: string;
}

export interface OfferOutcome {
  ok: boolean;
  message: string;
  id?: string;
}

/**
 * Saves a new offer as a draft for `userId`, through whatever client acts as them. The checks, their order and their
 * sentences are the website form's (they were the body of `createOffer`); the boundary is the database's.
 */
export async function createExportOffer(
  supabase: SupabaseClient,
  userId: string,
  input: ExportOfferInput,
  locale: Locale,
): Promise<OfferOutcome> {
  const t = (ar: string, en: string) => tr(locale, ar, en);

  if (!input.commodityId || !input.destinationId) {
    return { ok: false, message: t("اختر المنتج والوجهة.", "Choose the product and the destination.") };
  }
  // The pair is opened on its first offer; one nobody has studied yet is
  // created without rules, and the offer page says so.
  const { data: corridorId, error: corridorError } = await supabase.rpc("export_corridor_for", {
    p_commodity: input.commodityId,
    p_destination: input.destinationId,
  });
  if (corridorError || !corridorId) {
    console.error("export: corridor lookup failed", corridorError);
    return { ok: false, message: t("تعذّر فتح طريق هذا المنتج إلى هذه الوجهة. حاول ثانية.", "Could not open this product's route to this destination. Try again.") };
  }

  const amounts = offerAmounts(input.quantity, input.unitPrice, 100);
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
    plotRef: input.plotRef,
    areaHectares: input.areaHectares,
    latitude: input.latitude,
    longitude: input.longitude,
    boundary: input.boundary,
  };

  // Checked here for the message, enforced in the database for the boundary.
  // A constraint name tells a farmer nothing they can act on.
  const originIssue = originProblem(origin, locale);
  if (originIssue) return { ok: false, message: originIssue };

  // Parsed before anything is written, because JSON.parse throws on a typo; a
  // farmer pasting a boundary from a mapping tool will mistype it, and that
  // deserves a sentence — and certainly not a failure after the offer row was inserted.
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

  const { data: offer, error } = await supabase
    .from("export_offers")
    .insert({
      reference: offerReference(),
      owner_id: userId,
      season_id: input.seasonId || null,
      corridor_id: corridorId,
      grade_id: input.gradeId || null,
      quantity: quantityToString(amounts.quantityScaled),
      // Omitted rather than sent empty: the trigger fills it from the
      // commodity's default, and an empty string is not "unset" to PostgREST.
      ...(input.uom ? { uom_code: input.uom } : {}),
      unit_price_minor: Number(amounts.unitPriceMinor),
      value_minor: Number(amounts.valueMinor),
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !offer) {
    console.error("export: offer insert failed", error);
    return { ok: false, message: t("تعذّر حفظ العرض. راجع البيانات وحاول ثانية.", "The offer could not be saved. Check the details and try again.") };
  }

  const { error: originError } = await supabase.from("export_offer_origins").insert({
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
    const { error: undoError } = await supabase.from("export_offers").delete().eq("id", offer.id);
    if (undoError) console.error("export: rollback failed", undoError);
    return {
      ok: false,
      message: t("تعذّر حفظ بيانات المنشأ، فلم يُحفظ العرض. راجع الإحداثيّة.", "The origin details could not be saved, so the offer was not saved. Check the coordinates."),
    };
  }

  return { ok: true, id: offer.id as string, message: t("حُفظ العرض مسوّدة. راجعه ثم أرسله.", "The offer was saved as a draft. Review it, then send it.") };
}

export type OfferMove = "submitted" | "draft" | "withdrawn";

/**
 * Moves an offer between the states a farmer may move it between. `next` is checked here against a closed list, and
 * again by the state-machine trigger, and again by the row-level policy — which is what actually stops a farmer
 * publishing their own goods.
 */
export async function moveExportOffer(
  supabase: SupabaseClient,
  userId: string,
  offerId: string,
  next: string,
  locale: Locale,
): Promise<OfferOutcome> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  if (!["submitted", "draft", "withdrawn"].includes(next)) {
    return { ok: false, message: t("حالة غير معروفة.", "Unknown status.") };
  }

  const { data, error } = await supabase
    .from("export_offers")
    .update({ status: next })
    .eq("id", offerId)
    .eq("owner_id", userId)
    .select("id");

  if (error) {
    console.error("export: offer move failed", error);
    return { ok: false, message: t("تعذّر تغيير حالة العرض.", "The offer's status could not be changed.") };
  }

  // The row count, not the error, is what distinguishes a refusal here: a
  // policy that declines an update returns success and zero rows.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: t("لم يتغيّر شيء — العرض ليس في حالةٍ تسمح بهذا الانتقال.", "Nothing changed — the offer is not in a state that allows this move."),
    };
  }

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
