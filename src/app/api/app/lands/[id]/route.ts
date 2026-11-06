import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { cropName, irrigationLabel, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort } from "@/lib/soilClasses";
import { LAND_DOCUMENT_KINDS } from "@/lib/landDocuments";
import { cropsAtSoilSalinity, phNormal, waterSalinity, type LandTest } from "@/lib/landTests";
import { INVESTOR_MODELS, INVESTOR_MODEL_DETAIL, INVESTOR_MODEL_LABEL, type InvestorProfile, type LandRequest } from "@/lib/investors";
import { CHECK_LABEL, INSPECTION_STATUS_LABEL, VERDICT_LABEL, type InspectionRow } from "@/lib/inspections";
import { AREA_BAND_SHORT, PARTNER_CROP_KEYS, PARTNER_KIND_LABEL, areaBand, type PartnerCompany, type PartnerInterest } from "@/lib/partners";
import { COUNTRIES } from "@/lib/phone";
import { drawnBoundary, tenureLabel, verificationLabel } from "@/lib/appLandView";
import {
  addLandTestStep,
  decideLandInvestorInterest,
  decideLandPartnerInterest,
  deleteLandTestStep,
  setLandInvestorConsent,
  setLandPartnerConsent,
  type StepResult,
} from "@/lib/landOwnerSteps";
import type { Land, Season } from "@/types/database";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

const HOUR_MS = 3_600_000;
const SESSION_OVER = { error: "انتهت جلستك. ادخل من جديد." };
const notYours = (locale: Locale) => ({ error: tr(locale, "الأرض غير موجودة أو ليست لك.", "That land does not exist or is not yours.") });

/**
 * One land's card in the app (backlog 203): what the website shows its owner on «أراضيّ» (/lands) and on the field
 * card (/lands/[id]) together — the boundary as drawn, the area, the soil, the water, the nearest station, the
 * review and its note, the documents, whether it is listed and open to investors and to partner companies, the
 * requests waiting on it, its water and soil tests, and its seasons.
 *
 * PRIVACY. A land's exact place is its owner's and the administrator's. The policies also return a farmer's lands
 * to the agent they authorised, and every land to the administrator; this route serves only the caller's own land
 * (`.eq("owner_id", user.id)`) and answers anything else as not found, so the app shows nobody's place but the
 * owner's own. Everything is read as the signed-in person, through row-level security, with no elevated key.
 *
 * POST carries the owner's steps on the card to the website's own functions (src/lib/landOwnerSteps.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const locale = appLocale(req);
  const NOT_YOURS = notYours(locale);
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: row } = await supabase.from("lands").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!row) return NextResponse.json(NOT_YOURS, { status: 404 });
  const land = row as Land;
  const verified = land.verification === "verified";

  const [{ data: docRows }, { data: testRows }, { data: seasonRows }, { data: interestRows }] = await Promise.all([
    supabase.from("land_documents").select("id, kind, caption").eq("land_id", id),
    supabase.from("land_tests").select("*").eq("land_id", id).order("tested_on", { ascending: false }),
    supabase
      .from("seasons")
      .select("id, name, crop_key, irrigation, feddans, planting_date, harvest_date, status, harvest_kg")
      .eq("land_id", id)
      .order("planting_date", { ascending: false }),
    supabase.from("partner_interests").select("*").eq("status", "pending").eq("land_id", id),
  ]);

  const documents = (docRows ?? []) as { id: string; kind: string; caption: string | null }[];
  const have = new Set(documents.map((d) => d.kind));
  const kindLabel = (k: string) => LAND_DOCUMENT_KINDS.find((x) => x.value === k)?.label ?? k;

  // Partner companies' requests on this land, with the company's name, kinds and phone, as the website shows them.
  const interests = (interestRows ?? []) as PartnerInterest[];
  const companies = new Map<string, Pick<PartnerCompany, "id" | "name" | "kinds" | "phone">>();
  if (interests.length > 0) {
    const { data: cRows } = await supabase
      .from("partner_companies")
      .select("id, name, kinds, phone")
      .in("id", [...new Set(interests.map((i) => i.company_id))]);
    for (const c of (cRows ?? []) as Pick<PartnerCompany, "id" | "name" | "kinds" | "phone">[]) companies.set(c.id, c);
  }

  // Investors' requests and inspection requests, only on a verified land, as the website asks for them.
  let requests: LandRequest[] = [];
  let inspections: InspectionRow[] = [];
  if (verified) {
    const [{ data: rRows }, { data: iRows }, { data: pRows }] = await Promise.all([
      supabase.rpc("land_investor_requests"),
      supabase.rpc("land_inspection_list"),
      supabase.rpc("land_investor_profiles"),
    ]);
    const profiles = new Map(((pRows ?? []) as InvestorProfile[]).map((p) => [p.interest_id, p]));
    requests = ((rRows ?? []) as LandRequest[])
      .filter((r) => r.land_id === id)
      .map((r) => ({ ...r, profile: profiles.get(r.interest_id) }));
    inspections = ((iRows ?? []) as InspectionRow[]).filter((i) => i.role === "owner" && i.land_id === id);
  }

  const tests = (testRows ?? []) as LandTest[];
  const now = Date.now();
  const latestSoil = tests.find((x) => x.kind === "soil" && x.ec_dsm !== null);
  const soilCrops = latestSoil?.ec_dsm != null ? cropsAtSoilSalinity(Number(latestSoil.ec_dsm)) : null;
  const seasons = (seasonRows ?? []) as Pick<
    Season,
    "id" | "name" | "crop_key" | "irrigation" | "feddans" | "planting_date" | "harvest_date" | "status" | "harvest_kg"
  >[];
  const band = areaBand(land.feddans);
  const drawn = drawnBoundary(land);

  return NextResponse.json(
    {
      land: {
        id: land.id,
        name: land.name,
        state: land.state,
        locality: land.locality,
        village: land.village,
        feddans: Number(land.feddans),
        station_key: land.station_key,
        station: stationName(land.station_key, locale),
        water_source: land.water_source,
        water_source_label: waterSourceLabel(land.water_source, locale),
        water_per_feddan: land.water_per_feddan === null ? null : Number(land.water_per_feddan),
        soil_note: land.soil_note,
        previous_crops: land.previous_crops,
        tenure: tenureLabel(locale)[land.tenure] ?? land.tenure,
        // The owner's own place: this route serves no one else's land.
        latitude: land.latitude === null ? null : Number(land.latitude),
        longitude: land.longitude === null ? null : Number(land.longitude),
        boundary: drawn?.corners ?? null,
        drawn_feddans: drawn?.feddans ?? null,
        soil: land.soil_class
          ? {
              name: wrbShort(land.soil_class),
              probability: land.soil_pct ?? null,
              from_satellite: land.soil_source === "point",
            }
          : null,
        verification: land.verification,
        verification_label: verificationLabel(locale)[land.verification] ?? land.verification,
        verification_note: land.verification_note,
        documents_on_file: land.documents_on_file,
        documents_required: land.documents_required,
        listed: land.listed,
        // Null where the partner and investor migrations have not reached the database: the card then offers nothing.
        open_to_investors: land.open_to_investors ?? null,
        investor_models: land.investor_models ?? [],
        investor_note: land.investor_note ?? null,
        open_to_partners: land.open_to_partners ?? null,
        crop_keys: land.crop_keys ?? [],
        partner_group: [
          land.soil_class ? wrbShort(land.soil_class) : tr(locale, "التربة تُقرأ من موقع أرضك عند الفتح", "soil is read from your land's location when you open it"),
          band ? AREA_BAND_SHORT[band][locale] : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      documents: {
        kinds: LAND_DOCUMENT_KINDS.map((k) => ({ key: k.value, label: k.label, have: have.has(k.value) })),
        files: documents.map((d) => ({ id: d.id, kind: d.kind, label: kindLabel(d.kind), caption: d.caption })),
      },
      investors: {
        models: INVESTOR_MODELS.map((m) => ({ key: m, label: INVESTOR_MODEL_LABEL[m][locale], detail: INVESTOR_MODEL_DETAIL[m].owner[locale] })),
        requests: requests.map((r) => ({
          id: r.interest_id,
          status: r.status,
          name: r.investor_name,
          model: INVESTOR_MODEL_LABEL[r.model]?.[locale] ?? r.model,
          message: r.message,
          // The investor's phone only once the owner has accepted, as land_investor_requests returns it.
          phone: r.status === "accepted" ? r.investor_phone : null,
          record: r.profile ? investorRecord(r.profile, locale) : null,
        })),
        inspections: inspections.map((i) => ({
          id: i.id,
          status: i.status,
          name: i.investor_name,
          state: i.verdict ? VERDICT_LABEL[i.verdict][locale] : INSPECTION_STATUS_LABEL[i.status][locale],
          checks: i.checks.map((c) => CHECK_LABEL[c]?.[locale] ?? c),
        })),
      },
      partners: {
        crops: PARTNER_CROP_KEYS.map((c) => ({ key: c, label: cropName(c, locale) })),
        interests: interests.map((i) => {
          const c = companies.get(i.company_id);
          return {
            id: i.id,
            company: c?.name ?? null,
            kinds: c ? c.kinds.map((k) => PARTNER_KIND_LABEL[k]?.[locale] ?? k) : [],
            phone: c?.phone ?? null,
            message: i.message,
          };
        }),
      },
      tests: tests.map((x) => {
        const ec = x.ec_dsm === null ? null : Number(x.ec_dsm);
        const ph = x.ph === null ? null : Number(x.ph);
        const salinity = x.kind === "water" && ec !== null ? waterSalinity(ec) : null;
        return {
          id: x.id,
          kind: x.kind,
          tested_on: x.tested_on,
          lab: x.lab,
          values: [
            ec !== null && `EC ${ec} dS/m`,
            ph !== null && `pH ${ph}`,
            x.sar !== null && `SAR ${Number(x.sar)}`,
            x.organic_matter_pct !== null && `OM ${Number(x.organic_matter_pct)}%`,
          ]
            .filter(Boolean)
            .join(" · "),
          reading: [
            salinity === "none" && tr(locale, "ملوحة الماء: بلا قيدٍ على الريّ (أقلّ من ٠٫٧).", "Water salinity: no restriction on irrigation (below 0.7)."),
            salinity === "moderate" && tr(locale, "ملوحة الماء: قيدٌ خفيف إلى متوسّط (٠٫٧ إلى ٣٫٠).", "Water salinity: slight to moderate restriction (0.7 to 3.0)."),
            salinity === "severe" && tr(locale, "ملوحة الماء: قيدٌ شديد (فوق ٣٫٠).", "Water salinity: severe restriction (above 3.0)."),
            x.kind === "water" &&
              ph !== null &&
              (phNormal(ph) ? tr(locale, "الحموضة في المدى الطبيعيّ (٦٫٥–٨٫٤).", "Acidity is in the normal range (6.5–8.4).") : tr(locale, "الحموضة خارج المدى الطبيعيّ (٦٫٥–٨٫٤).", "Acidity is outside the normal range (6.5–8.4).")),
          ]
            .filter(Boolean)
            .join(" · "),
          note: x.note,
          // Its writer may take it back within the hour; the database decides.
          deletable: now - new Date(x.created_at).getTime() < HOUR_MS,
        };
      }),
      soil_crops:
        soilCrops && latestSoil
          ? {
              ec: Number(latestSoil.ec_dsm),
              tested_on: latestSoil.tested_on,
              full: soilCrops.full.map((c) => cropName(c.key, locale)),
              class_only: soilCrops.classOnly,
            }
          : null,
      seasons: seasons.map((s) => ({
        id: s.id,
        name: s.name,
        status: { active: tr(locale, "جارٍ", "Running"), completed: tr(locale, "مُقفل", "Closed"), abandoned: tr(locale, "متروك", "Abandoned") }[s.status] ?? s.status,
        line: [
          cropName(s.crop_key, locale),
          irrigationLabel(s.irrigation, locale),
          tr(locale, `${s.feddans} فدان`, `${s.feddans} feddans`),
          s.harvest_date ? `${s.planting_date} → ${s.harvest_date}` : s.planting_date,
          s.harvest_kg != null ? tr(locale, `${Math.round(Number(s.harvest_kg)).toLocaleString("en-US")} كجم`, `${Math.round(Number(s.harvest_kg)).toLocaleString("en-US")} kg`) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** «من يطلب الشراكة» (backlog 136), in the website's words: where the number is from, since when, and what they did. */
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

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * The owner's steps on the card, each through the same function the website's form calls:
 *
 *   {action: "investors", open, models, note}      اعرض أرضي على المستثمرين · أوقف عرضها
 *   {action: "investor_decide", interest_id, accept}
 *   {action: "partners", open, crop_keys}           افتح أرضي للشركات الشريكة · أغلقها
 *   {action: "partner_decide", interest_id, accept}
 *   {action: "test", kind, tested_on, ec_dsm, ph, sar, organic_matter_pct, lab, note}
 *   {action: "delete_test", test_id}
 *
 * The land must be the caller's own before anything is sent on; the database functions check again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const locale = appLocale(req);
  const NOT_YOURS = notYours(locale);
  const { supabase, user } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }

  const { data: mine } = await supabase.from("lands").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!mine) return NextResponse.json(NOT_YOURS, { status: 404 });

  let result: StepResult;
  switch (body.action) {
    case "investors":
      result = await setLandInvestorConsent(
        supabase,
        user.id,
        { landId: id, open: body.open === true, models: list(body.models).map(String), note: text(body.note) },
        locale,
      );
      break;
    case "investor_decide":
      result = await decideLandInvestorInterest(supabase, { interestId: text(body.interest_id), accept: body.accept === true }, locale);
      break;
    case "partners":
      result = await setLandPartnerConsent(
        supabase,
        user.id,
        { landId: id, open: body.open === true, cropKeys: list(body.crop_keys).map(String) },
        locale,
      );
      break;
    case "partner_decide":
      result = await decideLandPartnerInterest(supabase, { interestId: text(body.interest_id), accept: body.accept === true }, locale);
      break;
    case "test":
      result = await addLandTestStep(
        supabase,
        {
          landId: id,
          kind: text(body.kind),
          testedOn: text(body.tested_on),
          ec: numOrNull(body.ec_dsm),
          ph: numOrNull(body.ph),
          sar: numOrNull(body.sar),
          organic: numOrNull(body.organic_matter_pct),
          lab: text(body.lab),
          note: text(body.note),
        },
        locale,
      );
      break;
    case "delete_test": {
      const { deleted } = await deleteLandTestStep(supabase, text(body.test_id), id);
      result = deleted
        ? { ok: true, message: tr(locale, "حُذف الفحص.", "The test was deleted.") }
        : { ok: false, message: tr(locale, "لم يُحذف الفحص: يُحذف خلال ساعةٍ من كتابته فقط.", "The test was not deleted: it can be deleted only within an hour of being entered.") };
      break;
    }
    default:
      return NextResponse.json({ error: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}
