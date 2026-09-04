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
  /**
   * Stages carrying at least one piece of evidence **with an uploaded file**.
   *
   * The file is the whole condition, and it is the same one
   * `enforce_stage_completion` raises on: «الملاحظة النصية وحدها ليست دليلاً».
   * This count used to include note-only rows, which meant the platform's
   * heaviest trust factor credited exactly what its own trigger refuses to
   * accept — 20260905090000 closed that.
   */
  stagesWithEvidence: number;
  /**
   * Completed stages that carry both a planned and an actual end date.
   *
   * The denominator for punctuality, and the reason it exists: a stage with no
   * recorded end date proves nothing either way, and the old query counted it
   * as on time. Measuring over what is dated neither credits nor punishes the
   * unknown.
   */
  stagesDated: number;
  /** Of those dated stages, the ones that finished on or before the plan. */
  stagesOnTime: number;
}

export interface TrustFactor {
  key: string;
  label: string;
  weight: number;
  /**
   * 0–1, or null when there is nothing to measure this factor against.
   *
   * A null is not a zero. Zero says "never on time"; null says "no dates were
   * recorded", and the two must not render the same or score the same. A null
   * factor is dropped from the total and its weight redistributed over the
   * factors that do have evidence behind them.
   */
  score: number | null;
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
  //
  // "Documented" here means a file was uploaded. A typed note is useful to the
  // farmer and is not proof to anybody else, which is why the completion
  // trigger refuses it and why this count now matches the trigger.
  const stagesTotal = completed.reduce((s, x) => s + x.stagesTotal, 0);
  const withEvidence = completed.reduce((s, x) => s + x.stagesWithEvidence, 0);
  const evidenceRate = stagesTotal > 0 ? withEvidence / stagesTotal : 0;
  factors.push({
    key: "evidence",
    label: "الانضباط في التوثيق",
    weight: 25,
    score: stagesTotal > 0 ? clamp01(evidenceRate) : null,
    detail:
      stagesTotal > 0
        ? `${withEvidence} من ${stagesTotal} مرحلة موثّقة بملفّ مرفوع (${Math.round(evidenceRate * 100)}%).`
        : "لا مراحلَ مسجّلةً في المواسم المكتملة.",
  });

  // 3. Did the work land when it was planned to?
  //
  // Measured only over stages that carry both dates. An undated stage is not
  // evidence of lateness, and counting it either way would be a claim the
  // record cannot support.
  const onTime = completed.reduce((s, x) => s + x.stagesOnTime, 0);
  const dated = completed.reduce((s, x) => s + x.stagesDated, 0);
  const doneStages = completed.reduce((s, x) => s + x.stagesCompleted, 0);
  const undated = Math.max(0, doneStages - dated);
  const punctuality = dated > 0 ? onTime / dated : 0;
  factors.push({
    key: "punctuality",
    label: "الالتزام بالمواعيد",
    weight: 20,
    score: dated > 0 ? clamp01(punctuality) : null,
    detail:
      dated > 0
        ? `${onTime} من ${dated} مرحلة أُنجزت في موعدها المخطط (${Math.round(punctuality * 100)}%)` +
          (undated > 0
            ? `، و${undated} مرحلة بلا تاريخٍ مسجّل فلم تدخل الحساب.`
            : ".")
        : "لا مرحلةَ تحمل تاريخاً مخطّطاً ومنجَزاً معاً، فلا التزامَ يُقاس.",
  });

  // 4. Budget control. Coming in under budget is fine; the penalty is for
  //    overrun, and it grows with the size of the overrun.
  const plannedTotal = completed.reduce((s, x) => s + x.plannedBudget, 0);
  const actualTotal = completed.reduce((s, x) => s + x.actualCosts, 0);
  //
  // No planned budget used to score a perfect fifteen: `overrun` fell back to
  // 1, and 1 is "spent exactly what was planned". Recording no budget is not
  // budget discipline.
  const overrun = plannedTotal > 0 ? actualTotal / plannedTotal : 1;
  const budgetScore = overrun <= 1 ? 1 : clamp01(1 - (overrun - 1) / 0.5);
  factors.push({
    key: "budget",
    label: "ضبط الميزانية",
    weight: 15,
    score: plannedTotal > 0 ? budgetScore : null,
    detail:
      plannedTotal > 0
        ? `أنفق ${Math.round(overrun * 100)}% من الميزانية المخططة عبر مواسمه.`
        : "لا توجد ميزانية مخططة مسجّلة للمقارنة.",
  });

  // 5. Did the seasons actually make money? Abandoned seasons count against.
  //
  // A completed season with no ledger entries at all is not a loss-making
  // season — it is an unrecorded one, and `revenue > actualCosts` reads 0 > 0
  // as a failure. Those drop out of the denominator. An abandoned season stays
  // in regardless: abandonment is a fact about the season, not about its books.
  const priced = completed.filter((s) => s.revenue > 0 || s.actualCosts > 0);
  const profitable = priced.filter((s) => s.revenue > s.actualCosts).length;
  const outcomeBase = priced.length + abandoned.length;
  const outcome = outcomeBase > 0 ? profitable / outcomeBase : 0;
  const unpriced = completed.length - priced.length;
  factors.push({
    key: "outcome",
    label: "نتيجة المواسم",
    weight: 20,
    score: outcomeBase > 0 ? clamp01(outcome) : null,
    detail:
      outcomeBase > 0
        ? `${profitable} من ${priced.length} موسماً أُغلق برِبح` +
          (abandoned.length > 0 ? `، و${abandoned.length} موسماً توقّف` : "") +
          (unpriced > 0 ? `، و${unpriced} بلا سجلٍّ ماليّ فلم يدخل الحساب.` : ".")
        : "لا موسمَ يحمل سجلاً ماليّاً، فلا نتيجةَ تُقاس.",
  });

  /*
   * والوزنُ يُعاد توزيعُه على ما له سند.
   *
   * A factor with nothing to measure is dropped, and the remaining weights are
   * renormalised over what is left. The alternative — scoring an unmeasurable
   * factor as zero — publishes a judgement the record does not support, and the
   * alternative to that — scoring it as one — is the bug this migration was
   * written to remove.
   *
   * `experience` always has a denominator here (there is at least one completed
   * season by this point), so the divisor is never zero.
   */
  const measured = factors.filter(
    (f): f is TrustFactor & { score: number } => f.score !== null,
  );
  const unmeasured = factors.filter((f) => f.score === null).map((f) => f.label);
  const measuredWeight = measured.reduce((sum, f) => sum + f.weight, 0);
  const raw =
    (measured.reduce((sum, f) => sum + f.weight * f.score, 0) / measuredWeight) *
    100;

  /*
   * والتغطيةُ ثقةٌ أيضاً — وبدونها كانت إعادةُ التوزيع تكافئ الإخفاء.
   *
   * Renormalising alone made the score go **up** when data was missing: a farm
   * with three seasons, evidence filed and nothing else recorded scored 82.2
   * and was labelled «موثوق» — higher than it scored under the very bug this
   * change removes, because dropping a factor drops it out of the average
   * along with whatever it would have cost.
   *
   * A record is thin in two ways, and both deserve the same treatment. Depth is
   * how many seasons; coverage is how much of the scale the record can actually
   * answer for. So confidence is the product, and a record covering 45 of the
   * 100 points is pulled toward the neutral 50 as hard as a one-season record
   * is.
   *
   * تحفّظ، يُقال صراحةً: هذا لا يُلغي الحافزَ تماماً. «مجهول» لا يمكن أن يكون
   * في آنٍ واحد غيرَ عقوبةٍ وغيرَ مفيد؛ والاختيارُ بينهما اختيارُ أيِّ الخطأين
   * نحتمل. ومَن يقرأ هذه الصفحةَ يقرأها ليدفع مالاً، فالخطأُ الخطر أن تبدو
   * مزرعةٌ أفضلَ ممّا هي — ولذلك تُشدّ الدرجةُ نحو المنتصف، **ويُمنع الوسمُ**
   * أدناه منعاً لا يعالجه حساب.
   */
  const coverage = measuredWeight / 100;
  const depth = clamp01(completed.length / FULL_CONFIDENCE_SEASONS);
  const confidence = depth * coverage;
  const score =
    Math.round((raw * confidence + 50 * (1 - confidence)) * 10) / 10;

  /*
   * والوسمُ لا يُمنح على سجلٍّ ناقص.
   *
   * The number is an average over what is known; the label is a certification,
   * and certifying what was never measured is the one thing this page must not
   * do. So «موثوق» requires a complete record — every factor answered — and a
   * record missing a third of its weight cannot rise above «قيد البناء»
   * whatever the arithmetic says.
   */
  const complete = measuredWeight === 100;
  const band: TrustScore["band"] =
    completed.length < 2 || coverage < 2 / 3
      ? "building"
      : score >= 80 && complete
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
    /*
     * والملخّصُ يقول ما لم يدخل الحساب.
     *
     * A score computed over three of five factors is a narrower claim than one
     * computed over five, and a reader who is not told cannot tell the
     * difference. Naming the dropped factors is what keeps the number honest
     * rather than merely defensible.
     */
    summary:
      // `depth`, not `confidence`: coverage also shrinks the score now, and
      // blaming a short history for a gap in the record would send the farmer
      // to wait for another season when what is missing is a budget line.
      (depth < 1
        ? `الدرجة مبنية على ${completed.length} موسماً فقط، فهي مسحوبة نحو المنتصف حتى يكتمل السجل.`
        : `الدرجة مبنية على ${completed.length} مواسم مكتملة.`) +
      (unmeasured.length > 0
        ? ` ولم يدخلها ${unmeasured.join(" ولا ")} — لا سجلَّ يقيسها،` +
          ` فوزنُها وُزّع على ما سواها والدرجةُ مشدودةٌ نحو المنتصف بقدر ما نقص.`
        : ""),
  };
}
