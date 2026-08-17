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

export type ServiceKind =
  | "engineering_office"
  | "drone"
  | "irrigation"
  | "mechanization"
  | "advisory"
  | "veterinary"
  | "laboratory"
  | "logistics";

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  engineering_office: "مكتب هندسة زراعية",
  drone: "خدمات الطائرات المسيّرة",
  irrigation: "الري الحديث",
  mechanization: "الميكنة وإعداد الأرض",
  advisory: "الإرشاد ونقل المعرفة",
  veterinary: "الخدمات البيطرية",
  laboratory: "تحاليل التربة والمياه",
  logistics: "النقل والتخزين",
};

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

export type ProductionKind = "plant" | "livestock" | "both";

export const PRODUCTION_LABEL: Record<ProductionKind, string> = {
  plant: "إنتاج نباتي",
  livestock: "إنتاج حيواني",
  both: "الاثنان",
};

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
  | "transport";

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
  /** Why the basis is what it is — shown to both parties before signing. */
  note: string;
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
    note: "المساحة الممسوحة هي مساحة الموسم نفسها، فالكمية تُشتق من الفدادين لا تُقدَّر.",
  },
  {
    key: "topo_survey",
    name: "رفع طوبوغرافي",
    kind: "engineering_office",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    note: "يسبق التسوية ويحدّد ميولها؛ يقاس بالمساحة.",
  },
  {
    key: "soil_test",
    name: "تحليل تربة",
    kind: "laboratory",
    unit: "lump",
    production: "both",
    phase: "land_prep",
    basis: "fixed",
    note: "عدد العيّنات لا يتناسب طردياً مع المساحة؛ يُتعاقد عليه مقطوعية للموسم.",
  },
  {
    key: "water_test",
    name: "تحليل مياه",
    kind: "laboratory",
    unit: "lump",
    production: "both",
    phase: "land_prep",
    basis: "fixed",
    note: "عيّنة من المصدر تكفي الموسم ما لم يتغيّر المصدر.",
  },
  {
    key: "land_clearing",
    name: "إزالة وتنظيف",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    note: "عمل ميكانيكي يقاس بالمساحة مباشرة.",
  },
  {
    key: "land_leveling",
    name: "تسوية بالليزر",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "land_prep",
    basis: "feddans",
    note: "التسوية شرط كفاءة الري؛ تقاس بالمساحة.",
  },
  {
    key: "irrigation_design",
    name: "تصميم شبكة ري",
    kind: "engineering_office",
    unit: "lump",
    production: "plant",
    phase: "land_prep",
    basis: "fixed",
    note: "تصميم واحد للمشروع مهما اتّسع؛ التنفيذ هو ما يتوسّع لا التصميم.",
  },
  {
    key: "irrigation_install",
    name: "تنفيذ شبكة ري",
    kind: "irrigation",
    unit: "m3",
    production: "plant",
    phase: "land_prep",
    basis: "water_m3",
    note: "الشبكة تُحجَّم بالطلب المائي الموسمي المحسوب بمعادلة FAO-56، لا بالمساحة وحدها — فدان بالتنقيط غير فدان بالغمر.",
  },
  {
    key: "mechanized_planting",
    name: "زراعة ميكانيكية",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "planting",
    basis: "feddans",
    note: "تقاس بالمساحة المزروعة.",
  },
  {
    key: "crop_protection",
    name: "مكافحة",
    kind: "advisory",
    unit: "feddan",
    production: "plant",
    phase: "vegetative",
    basis: "feddans",
    note: "الرش يقاس بالمساحة المعالَجة.",
  },
  {
    key: "fertigation",
    name: "تسميد",
    kind: "advisory",
    unit: "feddan",
    production: "plant",
    phase: "vegetative",
    basis: "feddans",
    note: "تقاس بالمساحة؛ الجرعة تتبع تحليل التربة.",
  },
  {
    key: "harvest_service",
    name: "حصاد",
    kind: "mechanization",
    unit: "feddan",
    production: "plant",
    phase: "harvest",
    basis: "feddans",
    note: "تقاس بالمساحة المحصودة.",
  },
  {
    key: "extension_visit",
    name: "زيارة إرشادية",
    kind: "advisory",
    unit: "visit",
    production: "both",
    phase: null,
    basis: "months",
    note: "زيارة شهرية طوال دورة الإنتاج — تقليل المخاطر يحتاج انتظاماً لا زيارة واحدة.",
  },
  {
    key: "feasibility_study",
    name: "دراسة جدوى لمرحلة",
    kind: "engineering_office",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    note: "دراسة لكل مرحلة، تسبق التعاقد عليها.",
  },
  {
    key: "vet_program",
    name: "برنامج بيطري",
    kind: "veterinary",
    unit: "head",
    production: "livestock",
    phase: null,
    basis: "head",
    note: "التحصين والعلاج يقاسان بالرأس.",
  },
  {
    key: "feed_plan",
    name: "برنامج تغذية",
    kind: "advisory",
    unit: "head",
    production: "livestock",
    phase: null,
    basis: "head",
    note: "العلف هو ما يقابل الماء في الإنتاج النباتي: أكبر بند في الميزانية، ويقاس بالرأس.",
  },
  {
    key: "herd_health",
    name: "متابعة صحة القطيع",
    kind: "veterinary",
    unit: "visit",
    production: "livestock",
    phase: null,
    basis: "months",
    note: "متابعة دورية شهرية طوال الدورة.",
  },
  {
    key: "transport",
    name: "نقل",
    kind: "logistics",
    unit: "lump",
    production: "both",
    phase: null,
    basis: "fixed",
    note: "يُسعَّر بالرحلة حسب المسافة؛ مقطوعية في العقد.",
  },
];

export const SERVICE_BY_KEY: Record<ServiceKey, ServiceDefinition> =
  Object.fromEntries(SERVICE_CATALOGUE.map((s) => [s.key, s])) as Record<
    ServiceKey,
    ServiceDefinition
  >;

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
    // Ordered by when the work is actually due. Undated services (a feasibility
    // study, transport) sort first, because they are the ones that precede or
    // span the season rather than sitting inside it.
    .sort((a, b) => (a.plannedStart ?? "").localeCompare(b.plannedStart ?? ""))
    .map((m, i) => ({ ...m, seq: i + 1 }));
}
