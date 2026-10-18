import type { ServiceKey } from "./services";

/**
 * الأخطار وتكلفتها — البند ١١٢ (docs/studies/risk-costing-ar.md).
 *
 * Every risk is priced the same way: how often it happens, times how much of
 * the harvest it takes when it does. That product is the expected loss, and it
 * belongs in the season's budget like any input.
 *
 * The defaults are figures read in the source beside each one, and only those.
 * Where no source gave a frequency or a loss for Sudan the field is null: the
 * page asks the farmer for it rather than inventing one, and a risk with a
 * blank is simply not counted until it is filled in.
 */

export interface RiskSource {
  label: string;
  url: string;
}

export interface Bilingual {
  ar: string;
  en: string;
}

export type RiskKey = "locust" | "pests" | "drought" | "borehole" | "theft";

export interface RiskDefinition {
  key: RiskKey;
  name: Bilingual;
  /** Once every N years, from the source. Null when no source gave it. */
  everyYears: number | null;
  /** Share of the harvest lost when it happens, in percent: [low, high]. */
  lossPct: [number, number] | null;
  /**
   * A one-off sum to hold back instead of a share of the harvest, in dollars:
   * [low, high]. Used where the damage is to an asset, not the crop.
   */
  reserveUsd: [number, number] | null;
  /** What the default figures are, in words, so the reader can judge them. */
  basis: Bilingual | null;
  sources: RiskSource[];
  /** How to handle it: prevent, insure or hold a reserve. */
  treatment: Bilingual;
  /** Catalogue services that prevent or transfer it. */
  services: ServiceKey[];
}

export const FARM_RISKS: RiskDefinition[] = [
  {
    key: "locust",
    name: { ar: "الجراد الصحراوي", en: "Desert locust" },
    everyYears: 10,
    lossPct: [20, 30],
    reserveUsd: null,
    basis: {
      ar: "تذكّر مزارعو نهر النيل غزوَين في 1988 و1998، وضاع في الحقول التي غزاها 20–30٪ من الذرة حتى مع المكافحة.",
      en: "River Nile farmers recalled invasions in 1988 and 1998, and invaded fields lost 20–30% of their sorghum even with control.",
    },
    sources: [
      {
        label: "Socio-economics of Desert Locust Control in Sudan, 2002",
        url: "https://www.unisdr.org/files/3717_Document2005925151457EcomomStudySudanCaseBezabih2002.pdf",
      },
    ],
    treatment: {
      ar: "جاهزيّةٌ لا رشٌّ مجدول: الجراد لا موعد له، فيُتعاقد على الاستجابة السريعة ويُبلَّغ عنه فور ظهوره.",
      en: "Readiness, not a scheduled spray: locusts keep no calendar, so contract for a fast response and report them the moment they appear.",
    },
    services: ["locust_response"],
  },
  {
    key: "pests",
    name: { ar: "آفات الموسم: النطّاط ودودة الحشد", en: "Seasonal pests: grasshoppers and fall armyworm" },
    everyYears: null,
    lossPct: [15, 30],
    reserveUsd: null,
    basis: {
      ar: "أضاع النطّاط 15–30٪ من الذرة والدخن في غرب السودان في موسم 1989. ولم يذكر مصدرٌ كم مرّةً يتكرّر — فاكتبه من خبرة منطقتك.",
      en: "Grasshoppers took 15–30% of sorghum and millet in western Sudan in 1989. No source says how often it recurs — enter it from your area's experience.",
    },
    sources: [
      {
        label: "USAID, Supplementary Environmental Assessment, locust and grasshopper control in Sudan",
        url: "https://hopperwiki.org/images/1/16/Supplementary_environmental_assessment_%28SEA%29_for_USAID_funding_of_locust_or_grasshopper_pesticide_usage_in_Sudan.pdf",
      },
      {
        label: "CABI — fall armyworm losses of 20–55% in maize and sorghum",
        url: "https://www.cabi.org/projects/piloting-biopesticide-use-to-manage-fall-armyworm-in-south-sudan/",
      },
    ],
    treatment: {
      ar: "مراقبةٌ دوريّة، ورشٌّ حين تتجاوز الآفة عتبة الضرر الاقتصادي — أي حين يصير ما تُضيعه أكبر من ثمن الرشّة.",
      en: "Regular scouting, and a spray once the pest passes the economic threshold — when what it destroys is worth more than the spray.",
    },
    services: ["crop_protection"],
  },
  {
    key: "drought",
    name: { ar: "العطش في الزراعة المطريّة", en: "Drought on rain-fed land" },
    everyYears: 5,
    lossPct: null,
    reserveUsd: null,
    basis: {
      ar: "في القضارف يأتي في أربعة مواسم من خمسة 480 مم مطراً على الأقلّ، فالخامس أجفّ. ولم نجد كم يُضيع ذلك الموسم بالضبط؛ والمعروف أنّ نقص المطر 20٪ خفّض إنتاج الذرة حتى 25٪ — فاكتب ما يُضيعه الموسم الجافّ في أرضك. أرقام القضارف؛ فغيّرها لمنطقتك.",
      en: "In Gedaref four seasons in five bring at least 480 mm, so the fifth is drier. We found no figure for exactly what that season loses; what is known is that a 20% shortfall in rain cut sorghum output by up to 25% — so enter what a dry season costs on your land. Gedaref figures — change them for your area.",
    },
    sources: [
      {
        label: "Yousif et al. 2014 — Gedaref rainfall at 80/50/20% probability: 480/526/638 mm",
        url: "http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.416.9",
      },
      {
        label: "Elhag — climate change and sorghum productivity in Sudan",
        url: "http://repository.ruforum.org/documents/assessment-climate-change-impact-sorghum-productivity-sudan",
      },
    ],
    treatment: {
      ar: "اختر المحصول على مطر السنة الجافّة لا المتوسّطة، أو انقل الخطر بالتأمين.",
      en: "Choose the crop for the dry year's rain, not the average one — or move the risk with insurance.",
    },
    services: ["crop_insurance"],
  },
  {
    key: "borehole",
    name: { ar: "انهيار البئر أو تعطّلها", en: "Borehole collapse or failure" },
    everyYears: null,
    lossPct: null,
    reserveUsd: [800, 1000],
    basis: {
      ar: "يُذكر كثيراً أنّ نحو 30٪ من الآبار يتعطّل بعد حفره. وتأهيل البئر كلّف في غانا 800–1,000 دولار، والبئر الجديدة 4,500. فيُحجز للتأهيل احتياطيّ.",
      en: "Around 30% of boreholes are often quoted as failing after construction. Rehabilitation cost $800–1,000 in Ghana against $4,500 for a new well — so hold a rehabilitation reserve.",
    },
    sources: [
      { label: "Carter 2006, Cost-effective Boreholes", url: "https://www.ircwash.org/sites/default/files/Carter-2006-Tenstep.pdf" },
      { label: "Ewusi & Seidu 2020, Borehole Rehabilitation, Ghana", url: "https://doi.org/10.4314/gm.v20i2.2" },
    ],
    treatment: {
      ar: "صيانةٌ سنويّة واحتياطيٌّ للتأهيل، وقبلهما حفرٌ بمواصفةٍ تناسب تربة الموقع.",
      en: "Yearly maintenance and a rehabilitation reserve — and, before both, a well built to suit the ground.",
    },
    services: [],
  },
  {
    key: "theft",
    name: { ar: "السرقة", en: "Theft" },
    everyYears: null,
    lossPct: null,
    reserveUsd: null,
    basis: {
      ar: "لم نجد رقماً منشوراً للسودان، فاكتبه من خبرة منطقتك. وفي تجربة كينيا رفعت الحراسة قيمة الإنتاج 15٪، لكنّ أجر الحارس فاق فائدة المزارع الواحد.",
      en: "We found no published figure for Sudan, so enter it from your area's experience. In a Kenyan trial guards raised output value by 15%, but a guard cost more than one farmer gained.",
    },
    sources: [
      { label: "Dyer 2023, Journal of Development Economics", url: "https://doi.org/10.1016/j.jdeveco.2023.103109" },
    ],
    treatment: {
      ar: "حراسةٌ مشتركة بين المزارع المتجاورة: الحارس الواحد لعدّة مزارع أوفر من حارسٍ لكلّ مزرعة.",
      en: "Shared guarding between neighbouring farms: one guard for several farms costs less than a guard each.",
    },
    services: ["site_guarding"],
  },
];

export const RISK_BY_KEY = Object.fromEntries(FARM_RISKS.map((r) => [r.key, r])) as Record<RiskKey, RiskDefinition>;

/** What the farmer has set for one risk: whether it applies, and the two figures. */
export interface RiskSetting {
  key: RiskKey;
  applies: boolean;
  /** Once every N years. */
  everyYears: number | null;
  /** Share of the harvest lost when it happens, %. */
  lossPct: number | null;
  /** A reserve held back, $. */
  reserveUsd: number | null;
}

/** The starting settings: the source's figures, the high end of each range. */
export function defaultSettings(): RiskSetting[] {
  return FARM_RISKS.map((r) => ({
    key: r.key,
    applies: r.key !== "borehole",
    everyYears: r.everyYears,
    lossPct: r.lossPct ? r.lossPct[1] : null,
    reserveUsd: r.reserveUsd ? r.reserveUsd[1] : null,
  }));
}

const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

/**
 * Expected loss for one season, in dollars: the harvest's value × the share
 * lost ÷ how many years apart it comes. Null when a figure is missing — a blank
 * is not a zero, and the total says how many risks it could not count.
 */
export function expectedLossUsd(revenueUsd: number | null, s: RiskSetting): number | null {
  if (!s.applies || revenueUsd === null || !Number.isFinite(revenueUsd)) return null;
  if (!valid(s.everyYears) || !valid(s.lossPct)) return null;
  return (revenueUsd * Math.min(s.lossPct, 100)) / 100 / s.everyYears;
}

export interface RiskSummary {
  rows: { setting: RiskSetting; expectedUsd: number | null }[];
  /** Sum of the expected losses that could be counted. */
  expectedTotalUsd: number;
  /** Reserves held back for assets (the borehole). */
  reserveTotalUsd: number;
  /** Risks that apply but lack a figure, so are not in the total. */
  uncounted: RiskKey[];
  /** Margin after the expected losses and the reserves. */
  marginAfterUsd: number | null;
  /** The worst single risk, if it struck this season. */
  badYear: { key: RiskKey; marginUsd: number } | null;
}

/**
 * Puts the risks against the season. `margin` is the study's margin at the
 * national average and `revenue` its revenue; both null without a price.
 *
 * The bad year is the one risk with the largest loss share striking this
 * season — not all of them at once, which would describe a catastrophe rather
 * than a bad year, and not their average, which is what the expected loss
 * already is.
 */
export function summariseRisks(
  settings: RiskSetting[],
  revenueUsd: number | null,
  marginUsd: number | null,
): RiskSummary {
  const rows = settings.map((s) => ({ setting: s, expectedUsd: expectedLossUsd(revenueUsd, s) }));
  const expectedTotalUsd = rows.reduce((sum, r) => sum + (r.expectedUsd ?? 0), 0);
  const reserveTotalUsd = settings
    .filter((s) => s.applies && valid(s.reserveUsd))
    .reduce((sum, s) => sum + (s.reserveUsd as number), 0);
  const uncounted = settings
    .filter((s) => s.applies && !valid(s.reserveUsd) && (!valid(s.everyYears) || !valid(s.lossPct)))
    .map((s) => s.key);

  let badYear: RiskSummary["badYear"] = null;
  if (revenueUsd !== null && marginUsd !== null) {
    const worst = settings
      .filter((s) => s.applies && valid(s.lossPct))
      .sort((a, b) => (b.lossPct as number) - (a.lossPct as number))[0];
    if (worst) {
      badYear = {
        key: worst.key,
        marginUsd: marginUsd - (revenueUsd * Math.min(worst.lossPct as number, 100)) / 100,
      };
    }
  }

  return {
    rows,
    expectedTotalUsd,
    reserveTotalUsd,
    uncounted,
    marginAfterUsd: marginUsd === null ? null : marginUsd - expectedTotalUsd - reserveTotalUsd,
    badYear,
  };
}
