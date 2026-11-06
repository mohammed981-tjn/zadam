import { NextResponse } from "next/server";
import { loadExportChoices, loadCorridorRules, requirementStanding } from "@/lib/exportCorridors";
import { readinessModeLabel } from "@/lib/exportReadiness";
import { khartoumToday } from "@/lib/inputBoard";
import { createPublicClient } from "@/lib/supabase/public";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «ملفّ الصادر» في التطبيق (البند ٢٠٣). Public, as the reference tables are («ما تطلبه أوروبا ليس سرّاً، ومزارعٌ لا يرى
 * الشروط لا يستطيع استيفاءها»), read with the anon key:
 *
 *   - with no query: the products and destinations the website's offer form chooses from, grouped and labelled by the
 *     same loader (`loadExportChoices`), and which pairs have requirements on record;
 *   - with `?commodity=<id>&destination=<id>`: what that pair asks for — every dated requirement with its mode
 *     (required, conditional, recommended) and the day it took or takes effect — and when its rules were last checked
 *     and against what (`export_corridor_rules_status`, the line the offer page shows under the readiness).
 */
export async function GET(req: Request) {
  const locale = appLocale(req);
  const url = new URL(req.url);
  const commodity = url.searchParams.get("commodity");
  const destination = url.searchParams.get("destination");
  const supabase = createPublicClient();

  if (commodity === null && destination === null) {
    const choices = await loadExportChoices(supabase, locale);
    return NextResponse.json(choices, { headers: { "cache-control": "no-store" } });
  }
  if (!commodity || !destination || !UUID.test(commodity) || !UUID.test(destination)) {
    return NextResponse.json({ error: tr(locale, "اختر المنتج والوجهة.", "Choose the product and the destination.") }, { status: 400 });
  }

  const today = khartoumToday();
  const { corridorId, requirements, rules } = await loadCorridorRules(supabase, commodity, destination);
  const rows = requirements.map((r) => ({
    document_type_id: r.documentTypeId,
    code: r.code,
    name: r.nameAr,
    note: r.noteAr,
    mode: r.mode,
    mode_label: readinessModeLabel(r.mode, locale),
    effective_from: r.effectiveFrom,
    effective_to: r.effectiveTo,
    standing: requirementStanding(r, today),
  }));
  return NextResponse.json(
    {
      today,
      corridor_id: corridorId,
      // «لم تُدرس» unless a rule is in force today: a pair with none is unstudied, never «nothing required».
      studied: rows.some((r) => r.standing === "in_force"),
      requirements: rows.filter((r) => r.standing !== "retired"),
      rules: rules && {
        last_reviewed_at: rules.last_reviewed_at,
        reviewed_count: rules.reviewed_count,
        days_since: rules.days_since,
        review_days: rules.review_days,
        stale: rules.stale,
        source_note: rules.source_note,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
