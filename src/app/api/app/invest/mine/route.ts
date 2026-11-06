import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { COUNTRIES } from "@/lib/phone";
import { INTEREST_STATUS_LABEL, type InvestorProfile, type LandRequest, type MyInterest } from "@/lib/investors";
import type { InspectionRow } from "@/lib/inspections";
import { planTotals, type Plan } from "@/lib/inputPlans";
import { cropName } from "@/lib/farmLabelsEn";
import { formatUsd } from "@/lib/format";
import { areaShown, inspectionRowJson, modelLabel } from "@/lib/appInvest";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «استثماراتي وأرضي» في التطبيق (البند ٢٠٣): one read for both sides of the one account, as the website spreads
 * them over /invest/mine, /lands, /dashboard and /my-project:
 *
 *   • as an investor — the partnership requests sent (the owner's name, phone and the land's place only once
 *     accepted: investor_my_interests() masks the rest), the inspections asked for, and the shares requested in
 *     projects with their status;
 *   • as a landowner — the lands, which of them are verified and offered to investors with which models, the
 *     requests waiting on them with who is asking (land_investor_profiles), and the inspections asked on them;
 *   • the input lists of «مشروعي» with what was paid and what arrived.
 *
 * Everything through the caller's own session; the functions mask what the caller may not see.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;

  const [{ data: interestRows }, { data: inspectionRows }, { data: investmentRows }, { data: planRows }, { data: landRows }] =
    await Promise.all([
      supabase.rpc("investor_my_interests"),
      supabase.rpc("land_inspection_list"),
      supabase
        .from("investments")
        .select("id, shares, amount, status, created_at, projects(name, slug)")
        .eq("investor_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("input_plans").select("*, input_plan_items(*)").order("created_at", { ascending: false }),
      supabase
        .from("lands")
        .select("id, name, state, locality, feddans, verification, open_to_investors, investor_models, investor_note")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const lands = (landRows ?? []) as {
    id: string;
    name: string;
    state: string;
    locality: string | null;
    feddans: number;
    verification: string;
    open_to_investors?: boolean;
    investor_models?: string[] | null;
    investor_note?: string | null;
  }[];

  // Requests on the caller's own lands, with who is asking — only when a land of theirs is verified, as /lands reads.
  let requests: LandRequest[] = [];
  if (lands.some((l) => l.verification === "verified")) {
    const [{ data: rRows }, { data: pRows }] = await Promise.all([
      supabase.rpc("land_investor_requests"),
      supabase.rpc("land_investor_profiles"),
    ]);
    const profiles = new Map(((pRows ?? []) as InvestorProfile[]).map((p) => [p.interest_id, p]));
    requests = ((rRows ?? []) as LandRequest[]).map((r) => ({ ...r, profile: profiles.get(r.interest_id) }));
  }

  const inspections = (inspectionRows ?? []) as InspectionRow[];
  const interests = (interestRows ?? []) as MyInterest[];

  return NextResponse.json(
    {
      interests: interests.map((r) => ({
        interest_id: r.interest_id,
        land_id: r.land_id,
        place: [r.land_name, [r.state, r.locality].filter(Boolean).join(" · ")].filter(Boolean).join(" — "),
        area: areaShown(r.feddans, r.area_band, locale),
        model: r.model,
        model_label: modelLabel(r.model, locale),
        message: r.message,
        status: r.status,
        status_label: INTEREST_STATUS_LABEL[r.status]?.[locale] ?? r.status,
        owner_name: r.owner_name,
        owner_phone: r.owner_phone,
        village: r.village,
        map: r.latitude !== null && r.longitude !== null ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null,
        created_at: r.created_at,
      })),
      inspections: inspections.map((i) => inspectionRowJson(i, locale)),
      investments: ((investmentRows ?? []) as unknown as {
        id: string;
        shares: number;
        amount: number;
        status: string;
        created_at: string;
        projects: { name: string; slug: string } | null;
      }[]).map((i) => ({
        id: i.id,
        project: i.projects?.name ?? "",
        slug: i.projects?.slug ?? null,
        shares: i.shares,
        amount: formatUsd(Number(i.amount)),
        status: i.status,
        // The dashboard's words for the same three states.
        status_label: i.status === "pending" ? tr(locale, "بانتظار التأكيد", "Awaiting confirmation") : i.status === "confirmed" ? tr(locale, "مؤكد", "Confirmed") : tr(locale, "ملغى", "Cancelled"),
        created_at: i.created_at,
      })),
      plans: ((planRows ?? []) as Plan[]).map((p) => {
        const totals = planTotals(p.input_plan_items ?? []);
        return {
          id: p.id,
          title: p.title,
          crop: cropName(p.crop_key, locale),
          feddans: Number(p.feddans),
          status: p.status,
          status_label: { draft: tr(locale, "مسوّدة — راجعها ثمّ وافق", "Draft — review it, then approve"), approved: tr(locale, "موافَقٌ عليها — ادفع للموردين وسجّل", "Approved — pay the suppliers and record it"), closed: tr(locale, "مُقفلة", "Closed") }[p.status],
          ...totals,
        };
      }),
      lands: lands.map((l) => ({
        id: l.id,
        name: l.name,
        place: [l.state, l.locality].filter(Boolean).join(" · "),
        feddans: Number(l.feddans),
        verified: l.verification === "verified",
        // Undefined on a database the investor migration has not reached: the app then offers nothing that fails.
        investors_on: l.open_to_investors !== undefined,
        open_to_investors: l.open_to_investors === true,
        models: l.investor_models ?? [],
        model_labels: (l.investor_models ?? []).map((m) => modelLabel(m, locale)),
        note: l.investor_note ?? null,
        requests: requests
          .filter((r) => r.land_id === l.id)
          .map((r) => ({
            interest_id: r.interest_id,
            model_label: modelLabel(r.model, locale),
            message: r.message,
            status: r.status,
            investor_name: r.investor_name,
            investor_phone: r.investor_phone,
            record: r.profile ? investorRecord(r.profile, locale) : null,
          })),
        inspections: inspections.filter((i) => i.role === "owner" && i.land_id === l.id).map((i) => inspectionRowJson(i, locale)),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Who is asking (backlog 136), in the words LandInvestorConsent uses. */
function investorRecord(p: InvestorProfile, locale: Locale): string {
  const country = p.dial_code ? COUNTRIES.find((c) => c.dial === p.dial_code) : undefined;
  const since = p.member_since
    ? new Date(p.member_since).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { month: "long", year: "numeric" })
    : null;
  return [
    country ? tr(locale, `من ${country.name}`, `From ${country.nameEn}`) : tr(locale, "سجّل بالبريد", "signed up by email"),
    since && tr(locale, `في سوداقري منذ ${since}`, `On Sudagri since ${since}`),
    tr(locale, `طلبات شراكة: ${p.requests_sent}، قُبل منها ${p.requests_accepted}`, `Partnership requests: ${p.requests_sent}, of which ${p.requests_accepted} accepted`),
    tr(locale, `عقود موقّعة: ${p.agreements_signed}`, `Signed agreements: ${p.agreements_signed}`),
    p.risk_acknowledged && tr(locale, "أقرّ بتنبيه المخاطرة", "acknowledged the risk notice"),
  ]
    .filter(Boolean)
    .join(" · ");
}
