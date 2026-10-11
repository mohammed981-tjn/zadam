/**
 * Chain-of-custody integrity for mined gold.
 *
 * This registry records where material came from and every hand it passed
 * through. It does not trade, price, broker or take a commission — it holds
 * information, which is lawful today where trading is not, and which is the
 * asset that will matter when a lawful channel reopens.
 *
 * The checks follow the OECD Due Diligence Guidance for Responsible Supply
 * Chains of Minerals from Conflict-Affected and High-Risk Areas: identify the
 * origin, document every transfer, and raise the flags that guidance names.
 *
 * The check worth understanding is mass balance. Refining removes impurities,
 * so fine gold content can only fall along a chain. When it rises, material
 * that was never recorded has entered the lot — and that is the signature of
 * undocumented gold being mixed into a documented consignment. It is the
 * single most useful arithmetic in mineral traceability, and it is why weight
 * and fineness are recorded at every hop rather than only at the start.
 */

import { tr, type Locale } from "./i18n";

export type ExtractionMethod =
  | "gravity"
  | "borax"
  | "mercury"
  | "cyanide"
  | "unknown";

export const EXTRACTION_LABEL: Record<ExtractionMethod, string> = {
  gravity: "تركيز جاذبي فقط",
  borax: "بوراكس (بلا زئبق)",
  mercury: "ملغمة بالزئبق",
  cyanide: "سيانيد",
  unknown: "غير محدّد",
};

export const EXTRACTION_LABEL_EN: Record<ExtractionMethod, string> = {
  gravity: "Gravity concentration only",
  borax: "Borax (mercury-free)",
  mercury: "Mercury amalgamation",
  cyanide: "Cyanide",
  unknown: "Not specified",
};

export const extractionLabel = (m: ExtractionMethod, locale: Locale) =>
  locale === "en" ? EXTRACTION_LABEL_EN[m] : EXTRACTION_LABEL[m];

export type CustodyRole =
  | "miner"
  | "processor"
  | "transporter"
  | "aggregator"
  | "assayer"
  | "store";

export const CUSTODY_ROLE_LABEL: Record<CustodyRole, string> = {
  miner: "معدّن",
  processor: "معالج",
  transporter: "ناقل",
  aggregator: "مجمّع",
  assayer: "فاحص عيار",
  store: "مخزن",
};

export const CUSTODY_ROLE_LABEL_EN: Record<CustodyRole, string> = {
  miner: "Miner",
  processor: "Processor",
  transporter: "Transporter",
  aggregator: "Aggregator",
  assayer: "Assayer",
  store: "Store",
};

export interface SiteFacts {
  /** A licence number on file with the mining authority. */
  licensed: boolean;
  hasCoordinates: boolean;
  /** Any armed presence at or controlling the site. */
  armedPresence: boolean;
  /** Anyone under 18 working at the site. */
  childLabour: boolean;
  /** An independent visit that confirmed the site exists and is as described. */
  siteVisited: boolean;
}

export interface CustodyEvent {
  sequence: number;
  fromParty: string;
  toParty: string;
  role: CustodyRole;
  occurredAt: string;
  weightGrams: number;
  /** Purity as a fraction, 0–1. 0.995 is a common refined figure. */
  fineness: number;
  evidenceCount: number;
}

export interface Flag {
  key: string;
  severity: "critical" | "high" | "medium";
  message: string;
}

export interface ProvenanceResult {
  /** 0–100 documentation completeness. Never a statement about value. */
  score: number;
  chainIntact: boolean;
  flags: Flag[];
  /** Fine gold content at each hop, grams — the mass-balance trail. */
  fineGoldTrail: number[];
  mercuryFree: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fine gold content in grams: what actually has to balance along a chain. */
export function fineGold(weightGrams: number, fineness: number): number {
  return weightGrams * clamp01(fineness);
}

/**
 * Assesses one lot: its origin site, how it was processed, and every transfer.
 *
 * Returns flags rather than a verdict. A registry that silently rejects a lot
 * teaches nobody anything; one that names the specific problem tells the miner
 * what to fix and tells a future buyer exactly what they are looking at.
 */
export function assessProvenance(
  site: SiteFacts,
  method: ExtractionMethod,
  events: CustodyEvent[],
  locale: Locale = "ar",
): ProvenanceResult {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const flags: Flag[] = [];
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);

  // --- Origin -------------------------------------------------------------
  if (site.armedPresence) {
    flags.push({
      key: "armed_presence",
      severity: "critical",
      message: t(
        "الموقع تحت وجود مسلح أو قربه — هذه علامة حمراء قاطعة في إرشادات العناية الواجبة، ولا يُقبل معها توثيق مهما اكتمل.",
        "The site is under or near an armed presence — a definitive red flag in the due-diligence guidance; no documentation is acceptable with it, however complete.",
      ),
    });
  }
  if (site.childLabour) {
    flags.push({
      key: "child_labour",
      severity: "critical",
      message: t("عمالة أطفال في الموقع — علامة حمراء قاطعة.", "Child labour at the site — a definitive red flag."),
    });
  }
  if (!site.licensed) {
    flags.push({
      key: "unlicensed",
      severity: "high",
      message: t("لا يوجد ترخيص تعدين مسجّل للموقع.", "No mining licence is recorded for the site."),
    });
  }
  if (!site.hasCoordinates) {
    flags.push({
      key: "no_coordinates",
      severity: "high",
      message: t(
        "لا توجد إحداثيات للموقع — المنشأ غير قابل للتحديد.",
        "The site has no coordinates — the origin cannot be pinpointed.",
      ),
    });
  }
  if (!site.siteVisited) {
    flags.push({
      key: "no_visit",
      severity: "medium",
      message: t("لم تُسجَّل معاينة مستقلة للموقع.", "No independent site inspection has been recorded."),
    });
  }

  // --- Processing ---------------------------------------------------------
  const mercuryFree = method === "gravity" || method === "borax";
  if (method === "mercury") {
    flags.push({
      key: "mercury",
      severity: "high",
      message: t(
        "استُخدم الزئبق في الاستخلاص — ضار بالصحة، ويقلّل قابلية القبول لدى المشترين الملتزمين. طريقة البوراكس بديل مباشر.",
        "Mercury was used in extraction — harmful to health, and it lowers acceptance by responsible buyers. The borax method is a direct alternative.",
      ),
    });
  }
  if (method === "unknown") {
    flags.push({
      key: "method_unknown",
      severity: "medium",
      message: t("طريقة الاستخلاص غير مسجّلة.", "The extraction method is not recorded."),
    });
  }

  // --- Chain --------------------------------------------------------------
  let chainIntact = ordered.length > 0;
  const fineGoldTrail: number[] = [];

  if (ordered.length === 0) {
    flags.push({
      key: "no_custody",
      severity: "critical",
      message: t("لا توجد أي حلقة حيازة مسجّلة — لا سلسلة أصلاً.", "No custody link is recorded — there is no chain at all."),
    });
  }

  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    const content = fineGold(e.weightGrams, e.fineness);
    fineGoldTrail.push(content);

    if (i > 0) {
      const prev = ordered[i - 1];

      // Continuity: whoever received must be whoever hands over next.
      if (prev.toParty.trim() !== e.fromParty.trim()) {
        chainIntact = false;
        flags.push({
          key: `break_${e.sequence}`,
          severity: "critical",
          message: t(
            `انقطاع في السلسلة عند الحلقة ${e.sequence}: تسلّمها «${prev.toParty}» ` +
              `لكن الحلقة التالية تبدأ من «${e.fromParty}».`,
            `Break in the chain at link ${e.sequence}: "${prev.toParty}" received it, ` +
              `but the next link starts from "${e.fromParty}".`,
          ),
        });
      }

      // Time cannot run backwards.
      if (
        new Date(e.occurredAt).getTime() < new Date(prev.occurredAt).getTime()
      ) {
        chainIntact = false;
        flags.push({
          key: `time_${e.sequence}`,
          severity: "high",
          message: t(
            `تاريخ الحلقة ${e.sequence} أسبق من الحلقة التي قبلها.`,
            `Link ${e.sequence} is dated earlier than the link before it.`,
          ),
        });
      }

      // Mass balance: refining removes impurities, so fine gold cannot grow.
      // A tiny tolerance absorbs assay rounding, not real additions.
      const prevContent = fineGoldTrail[i - 1];
      if (content > prevContent * 1.005 + 0.01) {
        chainIntact = false;
        flags.push({
          key: `mass_${e.sequence}`,
          severity: "critical",
          message: t(
            `الذهب الصافي ارتفع عند الحلقة ${e.sequence} من ${prevContent.toFixed(2)} ` +
              `إلى ${content.toFixed(2)} جرام. الذهب لا يزيد أثناء النقل أو المعالجة — ` +
              `الزيادة تعني دخول مادة غير مسجّلة على الشحنة.`,
            `Fine gold rose at link ${e.sequence} from ${prevContent.toFixed(2)} ` +
              `to ${content.toFixed(2)} grams. Gold does not increase in transport or processing — ` +
              `the increase means unrecorded material has entered the lot.`,
          ),
        });
      }
    }

    if (e.evidenceCount < 1) {
      flags.push({
        key: `evidence_${e.sequence}`,
        severity: "medium",
        message: t(`الحلقة ${e.sequence} بلا أي دليل مرفوع.`, `Link ${e.sequence} has no evidence uploaded.`),
      });
    }
  }

  // --- Score --------------------------------------------------------------
  // Documentation completeness only. It says nothing about the gold's value,
  // and a critical flag caps it low however complete the paperwork is.
  const originScore =
    (site.licensed ? 0.4 : 0) +
    (site.hasCoordinates ? 0.35 : 0) +
    (site.siteVisited ? 0.25 : 0);

  const methodScore = mercuryFree ? 1 : method === "unknown" ? 0 : 0.4;

  const evidenced = ordered.filter((e) => e.evidenceCount > 0).length;
  const chainScore =
    ordered.length === 0
      ? 0
      : (chainIntact ? 0.6 : 0) + 0.4 * (evidenced / ordered.length);

  let score = 100 * (0.4 * originScore + 0.2 * methodScore + 0.4 * chainScore);

  if (flags.some((f) => f.severity === "critical")) score = Math.min(score, 25);

  return {
    score: Math.round(score * 10) / 10,
    chainIntact,
    flags,
    fineGoldTrail,
    mercuryFree,
  };
}
