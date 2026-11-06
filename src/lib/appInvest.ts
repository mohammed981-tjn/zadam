import { cropName, irrigationLabel, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort } from "@/lib/soilClasses";
import { soilEstimateWords } from "@/lib/soilPoint";
import { AREA_BAND_SHORT, areaShown, type AreaBand } from "@/lib/partners";
import {
  INTEREST_STATUS_LABEL,
  INVESTOR_MODEL_DETAIL,
  INVESTOR_MODEL_LABEL,
  INVESTOR_MODELS,
  RISK_NOTICE,
  type InvestorModel,
  type OpenLand,
} from "@/lib/investors";
import {
  CHECK_DETAIL,
  CHECK_LABEL,
  INSPECTION_CHECKS,
  INSPECTION_STATUS_LABEL,
  VERDICT_LABEL,
  feeLine,
  type InspectionRow,
} from "@/lib/inspections";
import { formatUsd, riskLabel, statusLabel } from "@/lib/format";
import type { Project } from "@/types/database";

/**
 * The investment pages as the phone app reads them (backlog 203): the same rows the website's /invest, /projects
 * and /invest/mine read, with every label written here in Arabic by the website's own label functions, so the app
 * says what the site says and keeps no second copy of the wording.
 *
 * Nothing here reads data; the routes under /api/app/invest read through the caller's own client and pass the rows.
 */

const ar = (a: string) => a;

/** The partnership models, the risk notice and the inspection checks: what the app needs to ask, said as the site says. */
export function investGlossary() {
  return {
    risk_notice: RISK_NOTICE.ar,
    models: INVESTOR_MODELS.map((m) => ({
      key: m,
      label: INVESTOR_MODEL_LABEL[m].ar,
      investor: INVESTOR_MODEL_DETAIL[m].investor.ar,
      owner: INVESTOR_MODEL_DETAIL[m].owner.ar,
    })),
    checks: INSPECTION_CHECKS.map((c) => ({ key: c, label: CHECK_LABEL[c].ar, detail: CHECK_DETAIL[c].ar })),
  };
}

export const modelLabel = (m: string) => INVESTOR_MODEL_LABEL[m as InvestorModel]?.ar ?? m;

/** One verified land offered to investors, as LandOfferCard shows it: no name, no village, no owner. */
export function landOfferJson(l: OpenLand, inspection?: InspectionRow) {
  const band = l.area_band as AreaBand | null;
  const soil = soilEstimateWords(l.soil_source, l.soil_pct, ar);
  return {
    land_id: l.land_id,
    place: [l.state, l.locality].filter(Boolean).join(" · "),
    feddans: l.feddans === null ? null : Number(l.feddans),
    area: l.feddans !== null ? `${Number(l.feddans).toLocaleString("en-US")} فدان` : band ? (AREA_BAND_SHORT[band]?.ar ?? null) : null,
    documents_on_file: l.documents_on_file,
    models: l.models.map((m) => ({ key: m, label: modelLabel(m) })),
    water: waterSourceLabel(l.water_source, "ar"),
    water_per_feddan: l.water_per_feddan ? `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} م³` : null,
    soil_label: soil.label,
    soil: l.soil_class ? wrbShort(l.soil_class) : null,
    soil_confidence: l.soil_class ? soil.confidence : null,
    climate: stationName(l.station_key, "ar"),
    crops: l.crop_keys.map((c) => cropName(c, "ar")),
    note: l.note,
    mine: l.mine,
    interest_status: l.interest_status,
    interest_label: l.interest_status ? INTEREST_STATUS_LABEL[l.interest_status].ar : null,
    inspection: inspection
      ? { id: inspection.id, status: inspection.status, label: INSPECTION_STATUS_LABEL[inspection.status].ar }
      : null,
  };
}

const TRIAL = "فرصة تجريبيّة: منفّذها من فريق المنصّة";
const DEMO = "نموذج توضيحي — ليس عرضاً حقيقياً";

/** A project as ProjectCard shows it, with the trial and illustrative labels the site puts on it. */
export function projectCardJson(p: Project, verifiedLand?: { documents: number; required: number }) {
  const funded = p.total_shares > 0 ? Math.min(100, Math.round((p.shares_sold / p.total_shares) * 100)) : 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    location: p.location,
    description: p.description,
    status: p.status,
    status_label: statusLabel(p.status),
    risk_level: p.risk_level,
    risk_label: `خطر ${riskLabel(p.risk_level)}`,
    total_feddans: Number(p.total_feddans),
    funded_pct: funded,
    share_price: formatUsd(Number(p.price_per_share)),
    expected_return: p.expected_annual_return ?? null,
    trial: Boolean(p.trial) && !p.is_demo,
    trial_label: p.trial && !p.is_demo ? TRIAL : null,
    is_demo: p.is_demo,
    demo_label: p.is_demo ? DEMO : null,
    verified_land: verifiedLand
      ? `على أرضٍ موثّقة · ${verifiedLand.documents} من ${verifiedLand.required} مستندات في الملفّ`
      : null,
  };
}

/** The study behind an opportunity: the facts its score was computed from, as the submission stored them. */
export function projectStudyJson(p: Project) {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") rows.push({ label, value });
  };
  add("درجة التقييم", p.risk_score === null || p.risk_score === undefined ? null : `${p.risk_score}/100`);
  add("مستوى الخطر", riskLabel(p.risk_level));
  add("المحصول", p.crop_key ? cropName(p.crop_key, "ar") : null);
  add("المنطقة المناخيّة", p.station_key ? stationName(p.station_key, "ar") : null);
  add("شهر الزراعة", p.planting_month ? String(p.planting_month) : null);
  add("طريقة الري", p.irrigation ? irrigationLabel(p.irrigation, "ar") : null);
  add("مصدر المياه", p.water_source ? waterSourceLabel(p.water_source, "ar") : null);
  add(
    "المياه المعلنة للفدان",
    p.declared_water_per_feddan ? `${Math.round(Number(p.declared_water_per_feddan)).toLocaleString("en-US")} م³` : null,
  );
  add(
    "المستندات في الملفّ",
    p.documents_required ? `${p.documents_on_file ?? 0} من ${p.documents_required}` : null,
  );
  add("المسافة إلى السوق", p.km_to_market ? `${Number(p.km_to_market).toLocaleString("en-US")} كم` : null);
  add("المساحة", `${Number(p.total_feddans)} فدان`);
  add("سعر الحصة الاسترشادي", formatUsd(Number(p.price_per_share)));
  add("الحصص", `${p.shares_sold} من ${p.total_shares} محجوزة`);
  return rows;
}

/** An inspection in a list: where, how big, what it is now. */
export function inspectionRowJson(i: InspectionRow) {
  return {
    id: i.id,
    ref: i.ref,
    role: i.role,
    land_id: i.land_id,
    place: [i.state, i.locality].filter(Boolean).join(" · "),
    area: areaShown(i.feddans, i.area_band, "ar"),
    status: i.status,
    status_label: INSPECTION_STATUS_LABEL[i.status]?.ar ?? i.status,
    verdict_label: i.verdict ? VERDICT_LABEL[i.verdict].ar : null,
    checks: (i.checks ?? []).map((c) => CHECK_LABEL[c]?.ar ?? c),
    investor_name: i.investor_name,
    fee: i.fee_sdg === null ? null : feeLine(i.fee_sdg, "ar"),
    visit_on: i.visit_on,
  };
}

export { feeLine, areaShown };
