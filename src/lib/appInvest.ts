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
import { tr, type Locale } from "@/lib/i18n";
import type { Project } from "@/types/database";

/**
 * The investment pages as the phone app reads them (backlog 203): the same rows the website's /invest, /projects
 * and /invest/mine read, with every label written by the website's own label functions in the language the app asked
 * for (Arabic unless English, backlog 208), so the app says what the site says and keeps no second copy of the wording.
 *
 * Nothing here reads data; the routes under /api/app/invest read through the caller's own client and pass the rows.
 */

/** The partnership models, the risk notice and the inspection checks: what the app needs to ask, said as the site says. */
export function investGlossary(locale: Locale = "ar") {
  return {
    risk_notice: RISK_NOTICE[locale],
    models: INVESTOR_MODELS.map((m) => ({
      key: m,
      label: INVESTOR_MODEL_LABEL[m][locale],
      investor: INVESTOR_MODEL_DETAIL[m].investor[locale],
      owner: INVESTOR_MODEL_DETAIL[m].owner[locale],
    })),
    checks: INSPECTION_CHECKS.map((c) => ({ key: c, label: CHECK_LABEL[c][locale], detail: CHECK_DETAIL[c][locale] })),
  };
}

export const modelLabel = (m: string, locale: Locale = "ar") => INVESTOR_MODEL_LABEL[m as InvestorModel]?.[locale] ?? m;

/** One verified land offered to investors, as LandOfferCard shows it: no name, no village, no owner. */
export function landOfferJson(l: OpenLand, inspection?: InspectionRow, locale: Locale = "ar") {
  const band = l.area_band as AreaBand | null;
  const soil = soilEstimateWords(l.soil_source, l.soil_pct, (a: string, e: string) => tr(locale, a, e));
  return {
    land_id: l.land_id,
    place: [l.state, l.locality].filter(Boolean).join(" · "),
    feddans: l.feddans === null ? null : Number(l.feddans),
    area: l.feddans !== null ? tr(locale, `${Number(l.feddans).toLocaleString("en-US")} فدان`, `${Number(l.feddans).toLocaleString("en-US")} feddans`) : band ? (AREA_BAND_SHORT[band]?.[locale] ?? null) : null,
    documents_on_file: l.documents_on_file,
    models: l.models.map((m) => ({ key: m, label: modelLabel(m, locale) })),
    water: waterSourceLabel(l.water_source, locale),
    water_per_feddan: l.water_per_feddan ? tr(locale, `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} م³`, `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} m³`) : null,
    soil_label: soil.label,
    soil: l.soil_class ? wrbShort(l.soil_class) : null,
    soil_confidence: l.soil_class ? soil.confidence : null,
    climate: stationName(l.station_key, locale),
    crops: l.crop_keys.map((c) => cropName(c, locale)),
    note: l.note,
    mine: l.mine,
    interest_status: l.interest_status,
    interest_label: l.interest_status ? INTEREST_STATUS_LABEL[l.interest_status][locale] : null,
    inspection: inspection
      ? { id: inspection.id, status: inspection.status, label: INSPECTION_STATUS_LABEL[inspection.status][locale] }
      : null,
  };
}

const TRIAL = (locale: Locale) => tr(locale, "فرصة تجريبيّة: منفّذها من فريق المنصّة", "A trial opportunity: run by the platform's team");
const DEMO = (locale: Locale) => tr(locale, "نموذج توضيحي — ليس عرضاً حقيقياً", "An illustrative example — not a real offer");

/** A project as ProjectCard shows it, with the trial and illustrative labels the site puts on it. */
export function projectCardJson(p: Project, verifiedLand?: { documents: number; required: number }, locale: Locale = "ar") {
  const funded = p.total_shares > 0 ? Math.min(100, Math.round((p.shares_sold / p.total_shares) * 100)) : 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    location: p.location,
    description: p.description,
    status: p.status,
    status_label: statusLabel(p.status, locale),
    risk_level: p.risk_level,
    risk_label: tr(locale, `خطر ${riskLabel(p.risk_level)}`, `${riskLabel(p.risk_level, "en")} risk`),
    total_feddans: Number(p.total_feddans),
    funded_pct: funded,
    share_price: formatUsd(Number(p.price_per_share)),
    expected_return: p.expected_annual_return ?? null,
    trial: Boolean(p.trial) && !p.is_demo,
    trial_label: p.trial && !p.is_demo ? TRIAL(locale) : null,
    is_demo: p.is_demo,
    demo_label: p.is_demo ? DEMO(locale) : null,
    verified_land: verifiedLand
      ? tr(
          locale,
          `على أرضٍ موثّقة · ${verifiedLand.documents} من ${verifiedLand.required} مستندات في الملفّ`,
          `On verified land · ${verifiedLand.documents} of ${verifiedLand.required} documents on file`,
        )
      : null,
  };
}

/** The study behind an opportunity: the facts its score was computed from, as the submission stored them. */
export function projectStudyJson(p: Project, locale: Locale = "ar") {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") rows.push({ label, value });
  };
  add(tr(locale, "درجة التقييم", "Score"), p.risk_score === null || p.risk_score === undefined ? null : `${p.risk_score}/100`);
  add(tr(locale, "مستوى الخطر", "Risk level"), riskLabel(p.risk_level, locale));
  add(tr(locale, "المحصول", "Crop"), p.crop_key ? cropName(p.crop_key, locale) : null);
  add(tr(locale, "المنطقة المناخيّة", "Climate zone"), p.station_key ? stationName(p.station_key, locale) : null);
  add(tr(locale, "شهر الزراعة", "Planting month"), p.planting_month ? String(p.planting_month) : null);
  add(tr(locale, "طريقة الري", "Irrigation method"), p.irrigation ? irrigationLabel(p.irrigation, locale) : null);
  add(tr(locale, "مصدر المياه", "Water source"), p.water_source ? waterSourceLabel(p.water_source, locale) : null);
  add(
    tr(locale, "المياه المعلنة للفدان", "Declared water per feddan"),
    p.declared_water_per_feddan ? tr(locale, `${Math.round(Number(p.declared_water_per_feddan)).toLocaleString("en-US")} م³`, `${Math.round(Number(p.declared_water_per_feddan)).toLocaleString("en-US")} m³`) : null,
  );
  add(
    tr(locale, "المستندات في الملفّ", "Documents on file"),
    p.documents_required ? tr(locale, `${p.documents_on_file ?? 0} من ${p.documents_required}`, `${p.documents_on_file ?? 0} of ${p.documents_required}`) : null,
  );
  add(tr(locale, "المسافة إلى السوق", "Distance to market"), p.km_to_market ? tr(locale, `${Number(p.km_to_market).toLocaleString("en-US")} كم`, `${Number(p.km_to_market).toLocaleString("en-US")} km`) : null);
  add(tr(locale, "المساحة", "Area"), tr(locale, `${Number(p.total_feddans)} فدان`, `${Number(p.total_feddans)} feddans`));
  add(tr(locale, "سعر الحصة الاسترشادي", "Indicative share price"), formatUsd(Number(p.price_per_share)));
  add(tr(locale, "الحصص", "Shares"), tr(locale, `${p.shares_sold} من ${p.total_shares} محجوزة`, `${p.shares_sold} of ${p.total_shares} reserved`));
  return rows;
}

/** An inspection in a list: where, how big, what it is now. */
export function inspectionRowJson(i: InspectionRow, locale: Locale = "ar") {
  return {
    id: i.id,
    ref: i.ref,
    role: i.role,
    land_id: i.land_id,
    place: [i.state, i.locality].filter(Boolean).join(" · "),
    area: areaShown(i.feddans, i.area_band, locale),
    status: i.status,
    status_label: INSPECTION_STATUS_LABEL[i.status]?.[locale] ?? i.status,
    verdict_label: i.verdict ? VERDICT_LABEL[i.verdict][locale] : null,
    checks: (i.checks ?? []).map((c) => CHECK_LABEL[c]?.[locale] ?? c),
    investor_name: i.investor_name,
    fee: i.fee_sdg === null ? null : feeLine(i.fee_sdg, locale),
    visit_on: i.visit_on,
  };
}

export { feeLine, areaShown };
