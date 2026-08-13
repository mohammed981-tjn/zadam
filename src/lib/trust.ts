/**
 * Operator trust score, computed from what a farmer actually did.
 *
 * Every previous version of this idea on the platform was a placeholder: the
 * scoring engine asked for "completed seasons" and "reporting rate" and nothing
 * could ever fill them. The seasons module changed that, so this reads the real
 * record — stages closed, evidence filed, dates met, budget held, seasons that
 * ended in profit — and turns it into a number an investor can inspect.
 *
 * The design follows microfinance practice (Grameen, Kiva) and the smallholder
 * scorers (FarmDrive, Apollo Agriculture): history of delivery beats collateral,
 * and a score is only worth showing when there is enough history behind it.
 * A farmer with no completed season gets "no record yet" rather than a
 * flattering guess or a punishing zero — both of which would be lies.
 */

export interface SeasonRecord {
  status: "active" | "completed" | "abandoned";
  feddans: number;
  plannedBudget: number;
  actualCosts: number;
  revenue: number;
  stagesTotal: number;
  stagesCompleted: number;
  stagesWithEvidence: number;
  /** Stages signed off on or before their planned end date. */
  stagesOnTime: number;
}

export interface TrustFactor {
  key: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export interface TrustScore {
  /** 0–100, or null when there is not enough history to say anything. */
  score: number | null;
  band: "new" | "building" | "established" | "trusted";
  bandLabel: string;
  factors: TrustFactor[];
  completedSeasons: number;
  totalFeddansManaged: number;
  summary: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const BAND_LABEL: Record<TrustScore["band"], string> = {
  new: "لا سجل بعد",
  building: "سجل قيد البناء",
  established: "سجل ثابت",
  trusted: "سجل موثوق",
};

/**
 * A score built on one season is barely evidence, so confidence is scaled by
 * how much history exists. Three completed seasons is treated as the point
 * where the record starts speaking for itself.
 */
const FULL_CONFIDENCE_SEASONS = 3;

export function computeTrust(seasons: SeasonRecord[]): TrustScore {
  const completed = seasons.filter((s) => s.status === "completed");
  const abandoned = seasons.filter((s) => s.status === "abandoned");
  const totalFeddans = seasons.reduce((sum, s) => sum + s.feddans, 0);

  if (completed.length === 0) {
    return {
      score: null,
      band: "new",
      bandLabel: BAND_LABEL.new,
      factors: [],
      completedSeasons: 0,
      totalFeddansManaged: totalFeddans,
      summary:
        seasons.length === 0
          ? "لم يسجّل هذا المنفّذ أي موسم على المنصة بعد."
          : `لديه ${seasons.length} موسماً جارياً ولم يُكمل أياً منها بعد، فلا سجل يُقاس عليه.`,
    };
  }

  const factors: TrustFactor[] = [];

  // 1. Depth of experience, saturating so a very long history does not swamp
  //    the quality factors.
  const experience = clamp01(completed.length / 5);
  factors.push({
    key: "experience",
    label: "الخبرة على المنصة",
    weight: 20,
    score: experience,
    detail: `${completed.length} موسماً مكتملاً على ${Math.round(totalFeddans)} فدان إجمالاً.`,
  });

  // 2. Evidence discipline — did they document, or just tick boxes?
  const stagesTotal = completed.reduce((s, x) => s + x.stagesTotal, 0);
  const withEvidence = completed.reduce((s, x) => s + x.stagesWithEvidence, 0);
  const evidenceRate = stagesTotal > 0 ? withEvidence / stagesTotal : 0;
  factors.push({
    key: "evidence",
    label: "الانضباط في التوثيق",
    weight: 25,
    score: clamp01(evidenceRate),
    detail: `${withEvidence} من ${stagesTotal} مرحلة موثّقة بأدلة (${Math.round(evidenceRate * 100)}%).`,
  });

  // 3. Did the work land when it was planned to?
  const onTime = completed.reduce((s, x) => s + x.stagesOnTime, 0);
  const doneStages = completed.reduce((s, x) => s + x.stagesCompleted, 0);
  const punctuality = doneStages > 0 ? onTime / doneStages : 0;
  factors.push({
    key: "punctuality",
    label: "الالتزام بالمواعيد",
    weight: 20,
    score: clamp01(punctuality),
    detail: `${onTime} من ${doneStages} مرحلة أُنجزت في موعدها المخطط (${Math.round(punctuality * 100)}%).`,
  });

  // 4. Budget control. Coming in under budget is fine; the penalty is for
  //    overrun, and it grows with the size of the overrun.
  const plannedTotal = completed.reduce((s, x) => s + x.plannedBudget, 0);
  const actualTotal = completed.reduce((s, x) => s + x.actualCosts, 0);
  const overrun = plannedTotal > 0 ? actualTotal / plannedTotal : 1;
  const budgetScore = overrun <= 1 ? 1 : clamp01(1 - (overrun - 1) / 0.5);
  factors.push({
    key: "budget",
    label: "ضبط الميزانية",
    weight: 15,
    score: budgetScore,
    detail:
      plannedTotal > 0
        ? `أنفق ${Math.round(overrun * 100)}% من الميزانية المخططة عبر مواسمه.`
        : "لا توجد ميزانية مخططة مسجّلة للمقارنة.",
  });

  // 5. Did the seasons actually make money? Abandoned seasons count against.
  const profitable = completed.filter((s) => s.revenue > s.actualCosts).length;
  const outcomeBase = completed.length + abandoned.length;
  const outcome = outcomeBase > 0 ? profitable / outcomeBase : 0;
  factors.push({
    key: "outcome",
    label: "نتيجة المواسم",
    weight: 20,
    score: clamp01(outcome),
    detail:
      `${profitable} من ${completed.length} موسماً أُغلق برِبح` +
      (abandoned.length > 0 ? `، و${abandoned.length} موسماً توقّف.` : "."),
  });

  const raw = factors.reduce((sum, f) => sum + f.weight * f.score, 0);

  // Shrink toward a neutral 50 while the history is thin, so a single lucky
  // season cannot manufacture a high score.
  const confidence = clamp01(completed.length / FULL_CONFIDENCE_SEASONS);
  const score =
    Math.round((raw * confidence + 50 * (1 - confidence)) * 10) / 10;

  const band: TrustScore["band"] =
    completed.length < 2
      ? "building"
      : score >= 80
        ? "trusted"
        : score >= 60
          ? "established"
          : "building";

  return {
    score,
    band,
    bandLabel: BAND_LABEL[band],
    factors,
    completedSeasons: completed.length,
    totalFeddansManaged: totalFeddans,
    summary:
      confidence < 1
        ? `الدرجة مبنية على ${completed.length} موسماً فقط، فهي مسحوبة نحو المنتصف حتى يكتمل السجل.`
        : `الدرجة مبنية على ${completed.length} مواسم مكتملة.`,
  };
}
