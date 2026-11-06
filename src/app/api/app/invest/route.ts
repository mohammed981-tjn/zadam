import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { createPublicClient } from "@/lib/supabase/public";
import { loadLandOffers, loadProjectLands } from "@/lib/landOffers";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { feeLine, investGlossary, landOfferJson, projectCardJson } from "@/lib/appInvest";
import type { PartnerCompany } from "@/lib/partners";
import { PARTNER_KIND_LABEL, type PartnerKind } from "@/lib/partners";
import type { Project } from "@/types/database";

/**
 * «فرص الاستثمار» في التطبيق (البند ٢٠٣): what /invest and /projects show — the verified land offered to investors,
 * the projects on offer with the site's trial labels, the inspection fee and the public count of reports, and the
 * verified partner companies (/partners).
 *
 * Like the website's pages, it opens for a visitor: without a session it reads as the anonymous visitor reads
 * (the public client, anon key, row-level security as for anyone). With the app's session it reads as that person
 * (src/lib/supabase/bearer.ts), so each land says whether it is theirs and what became of their request. A session
 * that is sent and refused is refused here too, rather than quietly read as a visitor.
 */
export async function GET(req: Request) {
  const sent = Boolean(req.headers.get("authorization"));
  const auth = sent ? await clientFromBearer(req) : null;
  if (sent && !auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const supabase = auth?.supabase ?? createPublicClient();

  const [offers, { data: projectRows }, projectLands, { data: companyRows }] = await Promise.all([
    loadLandOffers(supabase, Boolean(auth)),
    supabase.from("projects").select(VISITOR_COLUMNS.projects).neq("status", "draft").order("created_at", { ascending: false }),
    loadProjectLands(supabase),
    supabase
      .from("partner_companies")
      .select(VISITOR_COLUMNS.partner_companies)
      .not("verified_at", "is", null)
      .eq("active", true)
      .order("name")
      .limit(200),
  ]);

  const projects = (projectRows ?? []) as unknown as Project[];
  const companies = (companyRows ?? []) as unknown as PartnerCompany[];
  const stats = offers.stats;

  return NextResponse.json(
    {
      signed_in: Boolean(auth),
      lands_failed: offers.failed,
      lands: offers.lands.map((l) => landOfferJson(l, offers.openInspection.get(l.land_id))),
      projects: projects.map((p) => projectCardJson(p, projectLands.get(p.id))),
      inspections_on: offers.inspectionsOn,
      fee_line: feeLine(offers.fee, "ar"),
      reports:
        stats && stats.reported > 0
          ? `كُتب ${stats.reported} تقريراً: ${stats.clear} سليمة، و${stats.conditional} بشروط، و${stats.not_recommended} لا يُنصح بها.`
          : null,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        kinds: (c.kinds ?? []).map((k) => PARTNER_KIND_LABEL[k as PartnerKind]?.ar ?? k),
        states: c.states ?? [],
        phone: c.phone,
        whatsapp: c.whatsapp,
        bio: c.bio,
      })),
      ...investGlossary(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
