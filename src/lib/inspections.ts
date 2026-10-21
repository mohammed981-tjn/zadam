import type { Bi } from "@/lib/partners";
import type { Locale } from "@/lib/i18n";

/**
 * تقرير المعاينة المستقلّ بأجر (البند ١٢٨).
 *
 * The database is the boundary (supabase/migrations/20261022010000_land_
 * inspections.sql): `INSPECTION_CHECKS` mirrors the CHECK on
 * `land_inspections.checks`, and the verdicts and results mirror theirs, so a
 * form built from these cannot offer what the table would refuse.
 *
 * The fee is fixed and paid whatever the verdict; the count of reports by
 * verdict is public. The study behind both: docs/studies/farm-investment-
 * platforms-ar.md, §4 idea 9 and §6 source 1.
 */

export const INSPECTION_CHECKS = [
  "access",
  "boundaries",
  "area",
  "tenure",
  "water",
  "soil",
  "current_use",
  "equipment",
  "security",
] as const;
export type InspectionCheck = (typeof INSPECTION_CHECKS)[number];

export const CHECK_LABEL: Record<InspectionCheck, Bi> = {
  access: { ar: "الطريق والوصول", en: "Road and access" },
  boundaries: { ar: "الحدود والجيران", en: "Boundaries and neighbours" },
  area: { ar: "المساحة على الأرض", en: "Area on the ground" },
  tenure: { ar: "أوراق الحيازة", en: "Tenure papers" },
  water: { ar: "الماء ومصدره", en: "Water and its source" },
  soil: { ar: "التربة كما تُرى", en: "Soil as seen" },
  current_use: { ar: "حال الأرض الآن", en: "The land's present state" },
  equipment: { ar: "المضخّة والبئر والمعدّات", en: "Pump, well and equipment" },
  security: { ar: "الأمن في المنطقة", en: "Security in the area" },
};

/** What the inspector looks for, so the investor knows what they are asking. */
export const CHECK_DETAIL: Record<InspectionCheck, Bi> = {
  access: {
    ar: "هل يصلها طريقٌ صالح في الخريف والصيف، وكم تبعد عن أقرب سوق.",
    en: "Whether a road reaches it in the rains and the dry season, and how far the nearest market is.",
  },
  boundaries: {
    ar: "هل الحدود واضحة على الأرض، وهل يعترض الجيران أو يدّعي أحدٌ فيها شيئاً.",
    en: "Whether the boundaries are clear on the ground, and whether neighbours object or anyone claims part of it.",
  },
  area: {
    ar: "يقيس المساحة بالهاتف أو الحبل ويقارنها بالمسجَّلة.",
    en: "Measures the area by phone or rope and compares it with the registered one.",
  },
  tenure: {
    ar: "هل الأوراق المرفوعة تخصّ هذه الأرض، وهل هي باسم من عرضها.",
    en: "Whether the uploaded papers are for this land, and in the name of the person offering it.",
  },
  water: {
    ar: "مصدر الماء يعمل الآن، ويكفي المساحة، ولا خلاف على حصّته.",
    en: "The water source works now, suffices for the area, and its share is not disputed.",
  },
  soil: {
    ar: "لون التربة وحجارتها وملوحتها الظاهرة — بلا تحليل مختبر.",
    en: "Colour, stones and visible salinity — no laboratory analysis.",
  },
  current_use: {
    ar: "مزروعةٌ أم بور أم مُعدّة، وما زُرع فيها آخر موسم.",
    en: "Cropped, fallow or prepared, and what was grown in the last season.",
  },
  equipment: {
    ar: "المضخّة والبئر والقنوات: موجودةٌ وتعمل، أو تحتاج إصلاحاً.",
    en: "Pump, well and channels: present and working, or in need of repair.",
  },
  security: {
    ar: "هل الوصول آمن، وهل في المنطقة سرقةٌ أو نزاعٌ يمنع الزراعة.",
    en: "Whether it is safe to reach, and whether theft or conflict in the area stops farming.",
  },
};

export const VERDICTS = ["clear", "conditional", "not_recommended"] as const;
export type InspectionVerdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<InspectionVerdict, Bi> = {
  clear: { ar: "سليمةٌ كما عُرضت", en: "Sound as offered" },
  conditional: { ar: "سليمةٌ بشروط", en: "Sound, with conditions" },
  not_recommended: { ar: "لا يُنصح بها الآن", en: "Not recommended for now" },
};

export const VERDICT_TONE: Record<InspectionVerdict, string> = {
  clear: "bg-leaf/10 text-leaf ring-leaf/30",
  conditional: "bg-accent/10 text-accent ring-accent/30",
  not_recommended: "bg-rose/10 text-rose ring-rose/30",
};

export const RESULTS = ["ok", "issue", "not_seen"] as const;
export type InspectionResult = (typeof RESULTS)[number];

export const RESULT_LABEL: Record<InspectionResult, Bi> = {
  ok: { ar: "سليم", en: "Fine" },
  issue: { ar: "فيه ملاحظة", en: "Has an issue" },
  not_seen: { ar: "لم يُتحقَّق منه", en: "Not checked" },
};

export type InspectionStatus = "requested" | "declined" | "accepted" | "assigned" | "reported" | "cancelled";

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, Bi> = {
  requested: { ar: "بانتظار موافقة صاحب الأرض", en: "Waiting for the owner's consent" },
  declined: { ar: "اعتذر صاحب الأرض", en: "The owner declined" },
  accepted: { ar: "وافق صاحب الأرض — بانتظار مفتّش", en: "The owner agreed — waiting for an inspector" },
  assigned: { ar: "أُسندت إلى مفتّش", en: "Assigned to an inspector" },
  reported: { ar: "كُتب التقرير", en: "Report written" },
  cancelled: { ar: "أُلغيت", en: "Cancelled" },
};

export type FeeStatus = "free" | "due" | "paid";

/** One row of land_inspection_list(): the caller's own requests, lands and assignments. */
export interface InspectionRow {
  id: string;
  ref: string | null;
  role: "investor" | "owner" | "inspector";
  land_id: string;
  status: InspectionStatus;
  state: string | null;
  locality: string | null;
  feddans: number;
  checks: InspectionCheck[];
  investor_note: string | null;
  investor_name: string | null;
  fee_sdg: number | null;
  fee_status: FeeStatus;
  visit_on: string | null;
  verdict: InspectionVerdict | null;
  created_at: string;
  reported_at: string | null;
}

export interface InspectionPhoto {
  id: string;
  path: string;
  caption: string | null;
  captured_at: string | null;
  distance_km: number | null;
}

export interface InspectionFinding {
  key: InspectionCheck;
  result: InspectionResult;
  note: string | null;
}

/** land_inspection_view(): what this caller may see of one inspection. */
export interface InspectionView {
  id: string;
  ref: string | null;
  me: "investor" | "owner" | "inspector" | "admin";
  status: InspectionStatus;
  checks: InspectionCheck[];
  investor_note: string | null;
  fee_sdg: number | null;
  fee_status: FeeStatus;
  created_at: string;
  owner_decided_at: string | null;
  assigned_at: string | null;
  visit_on: string | null;
  verdict: InspectionVerdict | null;
  findings: InspectionFinding[] | null;
  summary: string | null;
  measured_feddans: number | null;
  reported_at: string | null;
  report_hash: string | null;
  owner_reply: string | null;
  owner_replied_at: string | null;
  cancel_reason: string | null;
  investor_name: string | null;
  inspector_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  land: {
    state: string | null;
    locality: string | null;
    feddans: number;
    water_source: string | null;
    soil_class: string | null;
    documents_on_file: number | null;
    name: string | null;
    village: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  photos: InspectionPhoto[];
}

export interface InspectionStats {
  reported: number;
  clear: number;
  conditional: number;
  not_recommended: number;
}

/** The fee line, the same everywhere it is shown. */
export function feeLine(fee: number | null, locale: Locale): string {
  if (fee === null) {
    return locale === "en"
      ? "Free during the trial season."
      : "مجّانيّة أثناء موسم التجربة.";
  }
  const n = Number(fee).toLocaleString("en-US");
  return locale === "en"
    ? `A fixed fee of SDG ${n}, paid whatever the verdict.`
    : `أجرٌ ثابت ${n} جنيه، يُدفع أيّاً كانت الخلاصة.`;
}
