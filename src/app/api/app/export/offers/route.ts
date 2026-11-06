import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { createExportOffer, loadMyExportOffers } from "@/lib/exportCorridors";
import { READINESS_SOURCE_NOTE, fetchReadiness, readinessModeLabel, readinessVerdict } from "@/lib/exportReadiness";
import { formatMinor, offerStatusHelp, offerStatusLabel, referenceName, referenceNote } from "@/lib/exportOffers";
import type { ExportCorridorRulesStatus, ExportReadinessLine } from "@/types/database";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «عروضي للتصدير» وجاهزيّتها في التطبيق (البند ٢٠٣).
 *
 * GET: the signed-in person's offers, as /export/offers lists them (`loadMyExportOffers`), each with the readiness its
 * own page shows — the verdict (`readinessVerdict`), the score, and every document line, satisfied or missing, from
 * the database's `export_offer_readiness` and `export_offer_readiness_detail` (security definer, owner-or-published
 * barrier inside), and the age of the corridor's rules.
 *
 * POST: saves a new offer as a draft — the website's readiness check is made on a saved offer, so this is how it is
 * kept. Same checks, same writes, same sentences as the website's form (`createExportOffer`), as this person through
 * row-level security. Evidence and custody are still added on the website's offer page.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;

  const offers = await loadMyExportOffers(supabase, user.id);
  const detailed = await Promise.all(
    offers.map(async (o) => {
      const [readiness, { data: lineRows }, { data: rulesRow }] = await Promise.all([
        fetchReadiness(supabase, o.id),
        supabase.rpc("export_offer_readiness_detail", { p_offer_id: o.id }),
        supabase.rpc("export_corridor_rules_status", { p_corridor_id: o.corridor_id }).maybeSingle(),
      ]);
      const lines = (lineRows ?? []) as ExportReadinessLine[];
      const rules = rulesRow as ExportCorridorRulesStatus | null;
      const commodity = o.corridor?.commodity;
      const destination = o.corridor?.destination;
      return {
        id: o.id,
        reference: o.reference,
        commodity: commodity ? referenceName(commodity.code, commodity.name_ar, locale) : null,
        destination: destination ? referenceName(destination.code, destination.name_ar, locale) : null,
        quantity: o.quantity,
        uom: o.uom_code,
        value: formatMinor(o.value_minor),
        status: o.status,
        status_label: offerStatusLabel(o.status, locale),
        status_help: offerStatusHelp(o.status, locale),
        rejection_reason: o.status === "rejected" ? o.rejection_reason : null,
        created_at: o.created_at,
        readiness: readiness
          ? {
              ready: readiness.ready,
              score: readiness.score,
              required_total: readiness.required_total,
              required_met: readiness.required_met,
              missing: readiness.missing,
              source: readiness.source,
              verdict: readinessVerdict(readiness, locale),
              source_note: READINESS_SOURCE_NOTE[readiness.source] ?? null,
              frozen_at: o.requirements_frozen_at,
            }
          : // No rule on record for this pair: «not studied», said as the offer page says it — never «ready».
            { verdict: readinessVerdict({ ready: false, score: 0, required_total: 0, required_met: 0, missing: [], source: "none" }, locale), source: "none" },
        lines: lines.map((l) => ({
          name: referenceName(l.code, l.name_ar, locale),
          note: referenceNote(l.code, l.note_ar, locale),
          mode: l.mode,
          mode_label: readinessModeLabel(l.mode, locale),
          satisfied: l.satisfied,
        })),
        rules: rules && { last_reviewed_at: rules.last_reviewed_at, days_since: rules.days_since, review_days: rules.review_days, stale: rules.stale },
      };
    }),
  );
  return NextResponse.json({ offers: detailed }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  // As the form's fields arrive: trimmed text. The boundary may be a GeoJSON polygon of some length.
  const text = (k: string, max = 120) =>
    typeof body[k] === "string" || typeof body[k] === "number" ? String(body[k]).trim().slice(0, max) : "";

  const result = await createExportOffer(
    auth.supabase,
    auth.user.id,
    {
      commodityId: text("commodity_id"),
      destinationId: text("destination_id"),
      quantity: text("quantity", 40),
      unitPrice: text("unit_price", 40),
      plotRef: text("plot_ref"),
      areaHectares: text("area_hectares", 40),
      latitude: text("latitude", 40),
      longitude: text("longitude", 40),
      boundary: text("boundary", 200_000),
      uom: text("uom_code", 20),
      gradeId: text("grade_id"),
      seasonId: "",
    },
    locale,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id, message: result.message });
}
