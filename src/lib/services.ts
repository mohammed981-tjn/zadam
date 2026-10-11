/**
 * الرافعة الخدمية — كتالوج الخدمات التعاقدية.
 *
 * This file exists to keep one promise the rest of the platform already makes.
 * agronomy.ts opens by explaining that the Arc Canal studies were wrong by a
 * factor of two because their water figures were asserted rather than derived,
 * and that here they are derived from FAO-56 so anyone can reproduce them.
 *
 * A service contract is where that discipline is worth the most, because this
 * is where money moves. The quantity on a contract line is not a number someone
 * types into a box and the other party has to trust — it follows from the
 * season the service is being bought for. A drone survey covers the season's
 * feddans. An irrigation network is sized by the peak water requirement the
 * FAO-56 engine already computed. A veterinary programme is priced per head of
 * an actual herd. Type nothing, derive everything, and the per-phase feasibility
 * study becomes something the platform can produce rather than something a
 * contractor asserts.
 *
 * The catalogue below is the shape of the offer. Prices are not here on purpose:
 * they belong to each provider, in the `services` table, because a price is a
 * commercial decision and this file is a description of the work.
 */

import type { StageKey } from "@/lib/season";
import type { Locale } from "@/lib/i18n";

export type ServiceKind =
  | "engineering_office"
  | "drone"
  | "irrigation"
  | "mechanization"
  | "advisory"
  | "veterinary"
  | "laboratory"
  | "logistics"
  | "legal"
  | "procurement"
  | "storage"
  | "security"
  | "insurance";

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  engineering_office: "مكتب هندسة زراعية",
  drone: "خدمات الطائرات المسيّرة",
  irrigation: "الري الحديث",
  mechanization: "الميكنة وإعداد الأرض",
  advisory: "الإرشاد ونقل المعرفة",
  veterinary: "الخدمات البيطرية",
  laboratory: "تحاليل التربة والمياه",
  logistics: "النقل والتخزين",
  legal: "التوثيق والتصاريح",
  procurement: "التوريد والتخليص",
  storage: "التجفيف والتخزين",
  security: "الحماية والأمن",
  insurance: "التأمين وإدارة المخاطر",
};

export const SERVICE_KIND_LABEL_EN: Record<ServiceKind, string> = {
  engineering_office: "Agricultural engineering office",
  drone: "Drone services",
  irrigation: "Modern irrigation",
  mechanization: "Mechanisation and land preparation",
  advisory: "Extension and knowledge transfer",
  veterinary: "Veterinary services",
  laboratory: "Soil and water analysis",
  logistics: "Transport and storage",
  legal: "Notarisation and permits",
  procurement: "Procurement and clearance",
  storage: "Drying and storage",
  security: "Protection and security",
  insurance: "Insurance and risk management",
};

export function serviceKindLabel(kind: ServiceKind, locale: Locale = "ar"): string {
  return locale === "en" ? SERVICE_KIND_LABEL_EN[kind] : SERVICE_KIND_LABEL[kind];
}

export type ServiceUnit =
  | "feddan"
  | "hour"
  | "visit"
  | "head"
  | "m3"
  | "month"
  | "lump";

export const SERVICE_UNIT_LABEL: Record<ServiceUnit, string> = {
  feddan: "فدان",
  hour: "ساعة",
  visit: "زيارة",
  head: "رأس",
  m3: "م³",
  month: "شهر",
  lump: "مقطوعية",
};

export const SERVICE_UNIT_LABEL_EN: Record<ServiceUnit, string> = {
  feddan: "feddan",
  hour: "hour",
  visit: "visit",
  head: "head",
  m3: "m³",
  month: "month",
  lump: "lump sum",
};

export function serviceUnitLabel(unit: ServiceUnit, locale: Locale = "ar"): string {
  return locale === "en" ? SERVICE_UNIT_LABEL_EN[unit] : SERVICE_UNIT_LABEL[unit];
}

export type ProductionKind = "plant" | "livestock" | "both";

export const PRODUCTION_LABEL: Record<ProductionKind, string> = {
  plant: "إنتاج نباتي",
  livestock: "إنتاج حيواني",
  both: "الاثنان",
};

export const PRODUCTION_LABEL_EN: Record<ProductionKind, string> = {
  plant: "Crop production",
  livestock: "Livestock production",
  both: "Both",
};

export function productionLabel(kind: ProductionKind, locale: Locale = "ar"): string {
  return locale === "en" ? PRODUCTION_LABEL_EN[kind] : PRODUCTION_LABEL[kind];
}

export type ServiceKey =
  | "drone_survey"
  | "topo_survey"
  | "soil_test"
  | "water_test"
  | "land_clearing"
  | "land_leveling"
  | "irrigation_design"
  | "irrigation_install"
  | "mechanized_planting"
  | "crop_protection"
  | "fertigation"
  | "harvest_service"
  | "extension_visit"
  | "feasibility_study"
  | "vet_program"
  | "feed_plan"
  | "herd_health"
  | "transport"
  | "land_permit"
  | "local_clearance"
  | "contract_notarization"
  | "water_permit"
  | "machinery_rental"
  | "machinery_procurement"
  | "customs_clearance"
  | "preharvest_assessment"
  | "threshing_cleaning"
  | "drying"
  | "hermetic_storage"
  | "cold_storage"
  | "haulage"
  | "soil_conservation"
  | "windbreak"
  | "machinery_maintenance"
  | "fire_protection"
  | "perimeter_fencing"
  | "site_guarding"
  | "locust_response"
  | "rodent_control"
  | "flood_protection"
  | "crop_insurance";

/**
 * How the billable quantity follows from the thing being served.
 *
 * This is the field that makes a contract checkable. Given a season or a herd,
 * every basis except `fixed` yields a number both sides can recompute — and
 * `fixed` is reserved for work whose size genuinely does not scale, like
 * writing one feasibility study.
 */
export type QuantityBasis =
  /** Area of the season, in feddans. */
  | "feddans"
  /** Peak seasonal irrigation requirement, in m³ — from the FAO-56 engine. */
  | "water_m3"
  /** Number of animals in the herd. */
  | "head"
  /** Whole months the production cycle runs. */
  | "months"
  /** One per season or cycle, regardless of size. */
  | "fixed";

export interface ServiceDefinition {
  key: ServiceKey;
  name: string;
  kind: ServiceKind;
  unit: ServiceUnit;
  production: ProductionKind;
  /**
   * The crop phase this service is normally delivered against, for the plant
   * side. Null where the service is not tied to one — a feasibility study is
   * written before anything starts, transport happens throughout.
   *
   * Note this is a *crop* phase, not a service phase: season_stages.stage_key
   * describes what the plant is doing, and a service is what a contractor
   * delivers while it does it. Keeping the two apart is what lets a contract be
   * scheduled against the agronomic calendar without pretending a drone survey
   * is a stage of growth.
   */
  phase: StageKey | null;
  basis: QuantityBasis;
  /**
   * Work that must complete before any field operation begins.
   *
   * An explicit flag rather than an inference from `phase === null`, which is
   * what the ordering used to rest on. That inference was wrong in a way that
   * was easy to miss: transport, extension visits and veterinary programmes
   * also have no crop phase, and were being scheduled ahead of land
   * preparation as if a monthly advisory visit had to finish before the
   * ploughing could start.
   *
   * The real distinction is consequence. A refused permit ends a project; a
   * late survey delays one. Only the first kind belongs at the front.
   */
  precondition: boolean;
  /** Why the basis is what it is — shown to both parties before signing. */
  note: string;
  nameEn: string;
  noteEn: string;
}

export const SERVICE_CATALOGUE: ServiceDefinition[] = [
  {
    key: "drone_survey",
    name: "مسح ورفع مساحي بالدرون",
    kind: "drone",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "المساحة الممسوحة هي مساحة الموسم نفسها، فالكمية تُشتق من الفدادين لا تُقدَّر.",
    nameEn: "Drone survey and mapping",
    noteEn:
      "The area surveyed is the season's own area, so the quantity is derived from the feddans, not estimated.",
  },
  {
    key: "topo_survey",
    name: "رفع طوبوغرافي",
    kind: "engineering_office",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "يسبق التسوية ويحدّد ميولها؛ يقاس بالمساحة.",
    nameEn: "Topographic survey",
    noteEn:
      "Comes before levelling and sets its slopes; measured by area.",
  },
  {
    key: "soil_test",
    name: "تحليل تربة",
    kind: "laboratory",
    unit: "lump",
    production: "both",
    phase: "land_prep",
    basis: "fixed",
    precondition: false,
    note: "عدد العيّنات لا يتناسب طردياً مع المساحة؛ يُتعاقد عليه مقطوعية للموسم.",
    nameEn: "Soil analysis",
    noteEn:
      "The number of samples does not scale with area; contracted as a lump sum for the season.",
  },
  {
    key: "water_test",
    name: "تحليل مياه",
    kind: "laboratory",
    unit: "lump",
    production: "both",
    phase: "land_prep",
    basis: "fixed",
    precondition: false,
    note: "عيّنة من المصدر تكفي الموسم ما لم يتغيّر المصدر.",
    nameEn: "Water analysis",
    noteEn:
      "One sample from the source covers the season unless the source changes.",
  },
  {
    key: "land_clearing",
    name: "إزالة وتنظيف",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "عمل ميكانيكي يقاس بالمساحة مباشرة.",
    nameEn: "Land clearing",
    noteEn:
      "Mechanical work measured directly by area.",
  },
  {
    key: "land_leveling",
    name: "تسوية بالليزر",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "التسوية شرط كفاءة الري؛ تقاس بالمساحة.",
    nameEn: "Laser levelling",
    noteEn:
      "Levelling is what makes irrigation efficient; measured by area.",
  },
  {
    key: "irrigation_design",
    name: "تصميم شبكة ري",
    kind: "engineering_office",
    unit: "lump",
    production: "plant",
    phase: "land_prep",
    basis: "fixed",
    precondition: false,
    note: "تصميم واحد للمشروع مهما اتّسع؛ التنفيذ هو ما يتوسّع لا التصميم.",
    nameEn: "Irrigation network design",
    noteEn:
      "One design per project however large it grows; it is the installation that scales, not the design.",
  },
  {
    key: "irrigation_install",
    name: "تنفيذ شبكة ري",
    kind: "irrigation",
    unit: "m3",
    production: "plant",
    phase: "land_prep",
    basis: "water_m3",
    precondition: false,
    note: "الشبكة تُحجَّم بالطلب المائي الموسمي المحسوب بمعادلة FAO-56، لا بالمساحة وحدها — فدان بالتنقيط غير فدان بالغمر.",
    nameEn: "Irrigation network installation",
    noteEn:
      "The network is sized by the seasonal water requirement computed with the FAO-56 method, not by area alone — a drip-irrigated feddan is not a flood-irrigated one.",
  },
  {
    key: "mechanized_planting",
    name: "زراعة ميكانيكية",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "planting",
    basis: "feddans",
    precondition: false,
    note: "تقاس بالمساحة المزروعة.",
    nameEn: "Mechanised planting",
    noteEn:
      "Measured by the area planted.",
  },
  {
    key: "crop_protection",
    name: "مكافحة",
    kind: "advisory",
    unit: "feddan",
    production: "plant",
    phase: "vegetative",
    basis: "feddans",
    precondition: false,
    note: "الرش يقاس بالمساحة المعالَجة.",
    nameEn: "Crop protection",
    noteEn:
      "Spraying is measured by the area treated.",
  },
  {
    key: "fertigation",
    name: "تسميد",
    kind: "advisory",
    unit: "feddan",
    production: "plant",
    phase: "vegetative",
    basis: "feddans",
    precondition: false,
    note: "تقاس بالمساحة؛ الجرعة تتبع تحليل التربة.",
    nameEn: "Fertilisation",
    noteEn:
      "Measured by area; the dose follows the soil analysis.",
  },
  {
    key: "harvest_service",
    name: "حصاد",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "harvest",
    basis: "feddans",
    precondition: false,
    note: "تقاس بالمساحة المحصودة.",
    nameEn: "Harvesting",
    noteEn:
      "Measured by the area harvested.",
  },
  {
    key: "extension_visit",
    name: "زيارة إرشادية",
    kind: "advisory",
    unit: "visit",
    production: "both",
    phase: null,
    basis: "months",
    precondition: false,
    note: "زيارة شهرية طوال دورة الإنتاج — تقليل المخاطر يحتاج انتظاماً لا زيارة واحدة.",
    nameEn: "Extension visit",
    noteEn:
      "A monthly visit throughout the production cycle — reducing risk needs regularity, not a single visit.",
  },
  {
    key: "feasibility_study",
    name: "دراسة جدوى لمرحلة",
    kind: "engineering_office",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "دراسة لكل مرحلة، تسبق التعاقد عليها.",
    nameEn: "Feasibility study for one phase",
    noteEn:
      "One study per phase, done before that phase is contracted.",
  },
  {
    key: "vet_program",
    name: "برنامج بيطري",
    kind: "veterinary",
    unit: "head",
    production: "livestock",
    phase: null,
    basis: "head",
    precondition: false,
    note: "التحصين والعلاج يقاسان بالرأس.",
    nameEn: "Veterinary programme",
    noteEn:
      "Vaccination and treatment are measured per head.",
  },
  {
    key: "feed_plan",
    name: "برنامج تغذية",
    kind: "advisory",
    unit: "head",
    production: "livestock",
    phase: null,
    basis: "head",
    precondition: false,
    note: "العلف هو ما يقابل الماء في الإنتاج النباتي: أكبر بند في الميزانية، ويقاس بالرأس.",
    nameEn: "Feeding programme",
    noteEn:
      "Feed is to livestock what water is to crops: the largest line in the budget, measured per head.",
  },
  {
    key: "herd_health",
    name: "متابعة صحة القطيع",
    kind: "veterinary",
    unit: "visit",
    production: "livestock",
    phase: null,
    basis: "months",
    precondition: false,
    note: "متابعة دورية شهرية طوال الدورة.",
    nameEn: "Herd health follow-up",
    noteEn:
      "Regular monthly follow-up throughout the cycle.",
  },
  {
    key: "transport",
    name: "نقل",
    kind: "logistics",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: false,
    note: "يُسعَّر بالرحلة حسب المسافة؛ مقطوعية في العقد.",
    nameEn: "Transport",
    noteEn:
      "Priced per trip by distance; a lump sum in the contract.",
  },

  /* -------------------------------------------------------------------------
   * الخدمات التنظيمية — شروط مسبقة لا أعمال ميدانية.
   *
   * These carry `phase: null` deliberately, which puts them at the front of
   * every generated plan. That ordering is not cosmetic: a survey that runs
   * late costs days, a permit that is refused ends the project, so the work
   * that can stop everything is the work that gets scheduled and paid first.
   *
   * Their proof is a document rather than a geotagged photograph, and the
   * approval gate handles that unchanged — milestone_evidence already accepts
   * 'report' and 'inspection'.
   * ---------------------------------------------------------------------- */
  {
    key: "land_permit",
    name: "تصريح استخدام الأرض",
    kind: "legal",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "يُستخرَج مرة للمشروع لا لكل فدان، فيُسعَّر مقطوعية. بدونه لا يبدأ عمل ميداني أصلاً.",
    nameEn: "Land-use permit",
    noteEn:
      "Issued once per project, not per feddan, so it is priced as a lump sum. Without it no field work can start at all.",
  },
  {
    key: "local_clearance",
    name: "إجراءات المحلية والإدارة الأهلية",
    kind: "legal",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "موافقات المحلية والإدارة الأهلية في الريف — تختلف من ولاية لأخرى، ومعرفة المسار المحلي هي الخدمة نفسها.",
    nameEn: "Locality and native administration procedures",
    noteEn:
      "Approvals from the locality and the rural native administration — they differ from state to state, and knowing the local route is the service itself.",
  },
  {
    key: "water_permit",
    name: "تصريح استخدام المياه",
    kind: "legal",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "سحب المياه من النيل أو الآبار يحتاج تصريحاً مستقلاً عن تصريح الأرض.",
    nameEn: "Water-use permit",
    noteEn:
      "Drawing water from the Nile or from wells needs a permit separate from the land permit.",
  },
  {
    key: "contract_notarization",
    name: "توثيق العقد",
    kind: "legal",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "توثيق قانوني يجعل العقد نافذاً أمام جهة قضائية — وهو ما يحمي الطرفين إن اختلفا لاحقاً.",
    nameEn: "Contract notarisation",
    noteEn:
      "Legal notarisation that makes the contract enforceable before a court — which protects both parties if they disagree later.",
  },

  /* -------------------------------------------------------------------------
   * الآليات — ثلاثة أشياء مختلفة يخلطها الناس.
   *
   * Hiring a machine with its operator is field work, and it scales with area.
   * Arranging a purchase or an import is administrative, and it costs the same
   * whatever the area. And the price of the machine itself is neither: it is an
   * asset that outlives the season and does not belong on a service contract at
   * all. Keeping the three apart stops a capital purchase being billed as a
   * seasonal operation, which is how a season's books end up unreadable.
   * ---------------------------------------------------------------------- */
  {
    key: "machinery_rental",
    name: "تأجير آلية بمشغّل",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "استئجار جرار أو حصادة مع مشغّلها — عمل ميداني يقاس بالمساحة، لا إجراء إداري.",
    nameEn: "Machine hire with operator",
    noteEn:
      "Hiring a tractor or harvester with its operator — field work measured by area, not an administrative procedure.",
  },
  {
    key: "machinery_procurement",
    name: "وساطة شراء أو استيراد آلية",
    kind: "procurement",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "أتعاب الوساطة والإجراءات فقط. ثمن الآلية نفسها أصل رأسمالي يتجاوز الموسم ولا يُدرَج في عقد خدمات.",
    nameEn: "Brokering a machine purchase or import",
    noteEn:
      "Brokerage fees and procedures only. The price of the machine itself is a capital asset that outlives the season and does not belong on a service contract.",
  },
  {
    key: "customs_clearance",
    name: "التخليص الجمركي",
    kind: "procurement",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "تكلفة الإرسالية الواحدة لا تتغيّر بمساحة المشروع، فتُسعَّر بالإرسالية. الرسوم الجمركية نفسها تُدفع للدولة لا للمخلّص.",
    nameEn: "Customs clearance",
    noteEn:
      "The cost per shipment does not change with the size of the project, so it is priced per shipment. Customs duties themselves are paid to the state, not to the clearing agent.",
  },
  /* -------------------------------------------------------------------------
   * ما قبل الحصاد وما بعده — حيث يُفقد المحصول بعد أن دُفعت كلفته كاملة.
   *
   * Sub-Saharan Africa loses grain worth about US$4 billion a year, and the
   * published loss range is 20–40%, with smallholders above 30%. Every pound of
   * that was already spent: seed, water, labour and the harvest itself are all
   * paid for by the time the loss happens, which makes this the cheapest yield
   * increase available anywhere on the platform. Hermetic storage is documented
   * taking losses from over 30% to under 2%.
   * ---------------------------------------------------------------------- */
  {
    key: "preharvest_assessment",
    name: "تقدير المحصول قبل الحصاد",
    kind: "engineering_office",
    unit: "feddan",
    production: "plant",
    phase: "maturity",
    basis: "feddans",
    precondition: false,
    note: "تقدير الكمية المتوقّعة يحدّد حجم النقل والتخزين المطلوب — والتقدير الخاطئ هنا يعني محصولاً ينتظر في العراء.",
    nameEn: "Pre-harvest yield estimate",
    noteEn:
      "Estimating the expected quantity sets how much transport and storage is needed — and a wrong estimate here means a crop left waiting in the open.",
  },
  {
    key: "threshing_cleaning",
    name: "دراس وتنظيف",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "harvest",
    basis: "feddans",
    precondition: false,
    note: "أول خطوة بعد الحصاد مباشرة، وتقاس بالمساحة المحصودة.",
    nameEn: "Threshing and cleaning",
    noteEn:
      "The first step straight after harvest, measured by the area harvested.",
  },
  {
    key: "drying",
    name: "تجفيف",
    kind: "storage",
    unit: "feddan",
    production: "plant",
    phase: "harvest",
    basis: "feddans",
    precondition: false,
    note: "الرطوبة هي ما يفسد الحبوب في المخزن — التجفيف قبل التخزين لا بعده، وإلا حفظ المخزنُ المشكلةَ لا المحصول.",
    nameEn: "Drying",
    noteEn:
      "Moisture is what spoils grain in store — dry before storing, not after, or the store preserves the problem instead of the crop.",
  },
  {
    key: "hermetic_storage",
    name: "تخزين محكم",
    kind: "storage",
    unit: "month",
    production: "plant",
    phase: null,
    basis: "months",
    precondition: false,
    note: "أكياس أو صوامع محكمة تخنق الحشرات بلا مبيد. موثّق أنها تخفض الفاقد من أكثر من ٣٠٪ إلى أقل من ٢٪ — أعلى عائد إلى تكلفة في الكتالوج كله.",
    nameEn: "Hermetic storage",
    noteEn:
      "Sealed bags or silos suffocate insects without pesticide. Documented to cut losses from over 30% to under 2% — the highest return on cost in the whole catalogue.",
  },
  {
    key: "cold_storage",
    name: "تخزين مبرّد",
    kind: "storage",
    unit: "month",
    production: "both",
    phase: null,
    basis: "months",
    precondition: false,
    note: "للخضر والألبان واللحوم. يُسعَّر بالشهر لأن التكلفة تشغيلية مستمرة لا حدث واحد.",
    nameEn: "Cold storage",
    noteEn:
      "For vegetables, dairy and meat. Priced per month because the cost is a continuing operating cost, not a one-off event.",
  },
  {
    key: "haulage",
    name: "ترحيل المحصول",
    kind: "logistics",
    unit: "feddan",
    production: "both",
    phase: "harvest",
    basis: "feddans",
    precondition: false,
    note: "من الحقل إلى المخزن أو السوق. يقاس بالمساحة لأن الكمية تتبعها؛ والمسافة تدخل في السعر لا في الكمية.",
    nameEn: "Crop haulage",
    noteEn:
      "From the field to the store or the market. Measured by area because the quantity follows it; distance goes into the price, not the quantity.",
  },
  /* -------------------------------------------------------------------------
   * الصيانة — للتربة وللآلة.
   *
   * Both are the same kind of spending: money laid out in one season to protect
   * an asset that has to serve several. A season that skips them looks cheaper
   * and is not — the cost simply lands later, on eroded land or on a machine
   * that fails at harvest.
   * ---------------------------------------------------------------------- */
  {
    key: "soil_conservation",
    name: "صيانة التربة",
    kind: "engineering_office",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "مصدّات ومدرّجات وحرث كنتوري ضد الانجراف. إنفاق موسم يحمي أصلاً يخدم مواسم — والأرض المنجرفة لا تُستعاد بموسم.",
    nameEn: "Soil conservation",
    noteEn:
      "Barriers, terraces and contour ploughing against erosion. One season's spending protects an asset that serves many — and eroded land is not recovered in a season.",
  },
  {
    key: "windbreak",
    name: "مصدّات رياح",
    kind: "engineering_office",
    unit: "feddan",
    production: "both",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "أحزمة شجرية تقلّل زحف الرمال والبخر معاً — تخدم التربة والاحتياج المائي في آن.",
    nameEn: "Windbreaks",
    noteEn:
      "Tree belts that reduce both drifting sand and evaporation — serving the soil and the water requirement at once.",
  },
  {
    key: "machinery_maintenance",
    name: "صيانة الآليات",
    kind: "mechanization",
    unit: "month",
    production: "both",
    phase: null,
    basis: "months",
    precondition: false,
    note: "برنامج صيانة دورية بالشهر. الجرار الذي يتعطّل في ذروة الحصاد يكلّف المحصول لا قطعة الغيار.",
    nameEn: "Machinery maintenance",
    noteEn:
      "A regular monthly maintenance programme. A tractor that breaks down at the peak of harvest costs the crop, not just the spare part.",
  },
  /* -------------------------------------------------------------------------
   * إدارة المخاطر — تكلفة معلومة مقابل خسارة مجهولة.
   *
   * Priced as contract lines rather than left as unbudgeted contingency,
   * because that is the only way a per-phase feasibility study can carry them.
   * The scale is not hypothetical: one square kilometre of locust swarm eats in
   * a day what 35,000 people eat, and the 2020 upsurge across East Africa and
   * Yemen caused damages estimated up to US$8.5 billion.
   * ---------------------------------------------------------------------- */
  {
    key: "fire_protection",
    name: "الوقاية من الحرائق ومكافحتها",
    kind: "security",
    unit: "feddan",
    production: "both",
    phase: null,
    basis: "feddans",
    precondition: false,
    note: "خطوط نار ومعدات إطفاء وتدريب. الحريق في محصول ناضج يمحو موسماً كاملاً في ساعة.",
    nameEn: "Fire prevention and control",
    noteEn:
      "Firebreaks, firefighting equipment and training. A fire in a ripe crop wipes out a whole season in an hour.",
  },
  {
    key: "perimeter_fencing",
    name: "التسوير والحماية",
    kind: "security",
    unit: "feddan",
    production: "both",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "السياج يمنع السطو ودخول الحيوان السائب معاً. يقاس بالمساحة تقريباً، والمحيط الفعلي يدخل في السعر.",
    nameEn: "Fencing and protection",
    noteEn:
      "A fence keeps out both theft and stray animals. Measured roughly by area; the actual perimeter goes into the price.",
  },
  {
    key: "site_guarding",
    name: "حراسة الموقع",
    kind: "security",
    unit: "month",
    production: "both",
    phase: null,
    basis: "months",
    precondition: false,
    note: "حراسة بالشهر طوال الدورة — تكلفة مستمرة لا حدث واحد، وتُدرَج في الميزانية بهذه الصفة.",
    nameEn: "Site guarding",
    noteEn:
      "Monthly guarding throughout the cycle — a continuing cost, not a one-off event, and budgeted as such.",
  },
  {
    key: "locust_response",
    name: "الاستجابة لأسراب الجراد",
    kind: "security",
    unit: "feddan",
    production: "plant",
    phase: null,
    basis: "feddans",
    precondition: false,
    note: "استجابة طارئة لا مرحلة مجدوَلة: سرب بمساحة كيلومتر مربع يأكل في يوم ما يأكله ٣٥ ألف إنسان، فالتعاقد على الجاهزية لا على موعد.",
    nameEn: "Locust swarm response",
    noteEn:
      "An emergency response, not a scheduled phase: a one-square-kilometre swarm eats in a day what 35,000 people eat, so the contract is for readiness, not for a date.",
  },
  {
    key: "rodent_control",
    name: "مكافحة القوارض",
    kind: "security",
    unit: "feddan",
    production: "both",
    phase: null,
    basis: "feddans",
    precondition: false,
    note: "خطر على الحقل والمخزن معاً — والمخزن أخطر، لأن الفاقد فيه يقع بعد دفع كل تكاليف الإنتاج.",
    nameEn: "Rodent control",
    noteEn:
      "A threat to both the field and the store — and the store is worse, because losses there come after every production cost has been paid.",
  },
  {
    key: "flood_protection",
    name: "الحماية من السيول والفيضان",
    kind: "engineering_office",
    unit: "feddan",
    production: "both",
    phase: "land_prep",
    basis: "feddans",
    precondition: false,
    note: "تروس وقنوات تصريف تُبنى قبل الموسم لا أثناءه — والسيل غير المتوقّع موسمياً هو بالضبط ما لا يمهل لبنائها.",
    nameEn: "Flood and torrent protection",
    noteEn:
      "Embankments and drainage channels built before the season, not during it — and an unseasonal flash flood is exactly what leaves no time to build them.",
  },
  {
    key: "crop_insurance",
    name: "وساطة تأمين زراعي",
    kind: "insurance",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    precondition: true,
    note: "ترتيب وثيقة تأمين قبل بدء الموسم. شرط مسبق لأن وثيقة تُطلب بعد وقوع الضرر لا تغطّيه — والتأمين يقوم مقام الضمانة التي يطلبها المموّل.",
    nameEn: "Crop insurance brokerage",
    noteEn:
      "Arranging an insurance policy before the season begins. A precondition, because a policy requested after the damage does not cover it — and insurance stands in for the collateral a financier asks for.",
  },
];

export const SERVICE_BY_KEY: Record<ServiceKey, ServiceDefinition> =
  Object.fromEntries(SERVICE_CATALOGUE.map((s) => [s.key, s])) as Record<
    ServiceKey,
    ServiceDefinition
  >;

/** A service's name in the reader's language; unknown keys fall back to `fallback`. */
export function serviceName(
  key: string,
  locale: Locale = "ar",
  fallback?: string,
): string {
  const def = SERVICE_BY_KEY[key as ServiceKey];
  if (!def) return fallback ?? key;
  return locale === "en" ? def.nameEn : def.name;
}

export function serviceNote(def: ServiceDefinition, locale: Locale = "ar"): string {
  return locale === "en" ? def.noteEn : def.note;
}

/**
 * What a service can be measured against.
 *
 * Every field is optional because a herd has no feddans and a season has no
 * head count. A basis that finds nothing to measure returns null rather than
 * zero — a quantity of zero is a real contract line worth nothing, while null
 * means "this service does not apply to this production unit", and the two must
 * not be confused when the number is about to become money.
 */
export interface QuantityContext {
  /** Area of the season, in feddans. */
  feddans?: number;
  /** Seasonal irrigation requirement in m³, from `planSeason().totalWaterM3`. */
  waterM3?: number;
  /** Head count of the herd. */
  headCount?: number;
  /** Length of the production cycle, in whole months. */
  months?: number;
}

/**
 * The billable quantity for one service against one production unit.
 *
 * Returns null when the service does not apply — a vet programme against a crop
 * season, an irrigation network against a herd. Callers must treat null as "do
 * not offer this line", never as zero.
 */
export function deriveQuantity(
  def: ServiceDefinition,
  ctx: QuantityContext,
): number | null {
  const positive = (n: number | undefined): number | null =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

  switch (def.basis) {
    case "feddans":
      return positive(ctx.feddans);
    case "water_m3":
      return positive(ctx.waterM3);
    case "head":
      return positive(ctx.headCount);
    case "months":
      return positive(ctx.months);
    case "fixed":
      return 1;
  }
}

export interface MilestoneDraft {
  seq: number;
  title: string;
  serviceKey: ServiceKey;
  unit: ServiceUnit;
  quantity: number;
  unitPrice: number;
  amount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  /** The derivation, kept with the line so both parties can check the sum. */
  basis: QuantityBasis;
  note: string;
}

/** One phase of the production plan a service can be scheduled against. */
export interface PhaseWindow {
  key: StageKey;
  startDate: string;
  endDate: string;
}

/**
 * Turns a set of chosen services into a dated, priced, ordered contract plan.
 *
 * This is the request — "all these services are sequenced and separated in time
 * according to stages and progress, per agreed schedules" — expressed as a
 * function. The phases come from the season plan the platform already derives
 * from FAO-56, so the schedule in the contract and the schedule the crop
 * actually follows are the same schedule rather than two documents that drift.
 *
 * Services whose quantity cannot be derived from the given context are dropped
 * rather than priced at zero, so a livestock service selected against a crop
 * season never becomes a free line on an invoice.
 */
export function buildMilestonePlan(
  choices: { serviceKey: ServiceKey; unitPrice: number }[],
  ctx: QuantityContext,
  phases: PhaseWindow[],
): MilestoneDraft[] {
  const windowFor = (phase: StageKey | null): PhaseWindow | undefined =>
    phase ? phases.find((p) => p.key === phase) : undefined;

  return choices
    .map((choice) => {
      const def = SERVICE_BY_KEY[choice.serviceKey];
      if (!def) return null;

      const quantity = deriveQuantity(def, ctx);
      if (quantity === null) return null;

      const window = windowFor(def.phase);

      return {
        title: def.name,
        serviceKey: def.key,
        unit: def.unit,
        quantity,
        unitPrice: choice.unitPrice,
        amount: quantity * choice.unitPrice,
        plannedStart: window?.startDate ?? null,
        plannedEnd: window?.endDate ?? null,
        basis: def.basis,
        note: def.note,
      };
    })
    .filter((m): m is Omit<MilestoneDraft, "seq"> => m !== null)
    /*
     * Preconditions first, then everything else in calendar order.
     *
     * The sort used to key on plannedStart alone, which put every undated
     * service at the front — including transport and monthly advisory visits,
     * as though a routine extension call had to be finished before the
     * ploughing could begin. Now the flag decides, and it means what it says:
     * a refused permit ends the project, so it is scheduled and paid before
     * anyone books a tractor.
     */
    .sort((a, b) => {
      const aPre = SERVICE_BY_KEY[a.serviceKey].precondition;
      const bPre = SERVICE_BY_KEY[b.serviceKey].precondition;
      if (aPre !== bPre) return aPre ? -1 : 1;
      return (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "");
    })
    .map((m, i) => ({ ...m, seq: i + 1 }));
}
