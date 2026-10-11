import {
  READINESS_SOURCE_NOTE,
  READINESS_SOURCE_NOTE_EN,
  readinessModeLabel,
  readinessVerdict,
  type ExportOfferReadiness,
} from "@/lib/exportReadiness";
import { referenceName, referenceNote } from "@/lib/exportOffers";
import { tr, type Locale } from "@/lib/i18n";
import type {
  ExportReadinessLine,
  ExportCorridorRulesStatus,
} from "@/types/database";

/**
 * «٧ من ٨ — وما هو الثامن».
 *
 * WHY THE VERDICT IS LARGER THAN THE PERCENTAGE
 *
 * The percentage is the friendlier number and the more dangerous one. A farmer
 * reading "٩٣٪" concludes they are nearly done; a buyer reading it concludes the
 * shipment is nearly clearable. Both are wrong when the missing seven percent is
 * the phytosanitary certificate, because customs does not average.
 *
 * So the sentence — ready or not, and how many required documents are short —
 * is what the eye lands on, and the bar sits under it as progress, unlabelled as
 * a verdict.
 *
 * WHY THE MISSING ONES ARE NAMED AND NOT COUNTED
 *
 * A count tells you that you are not finished. A name tells you where to go
 * tomorrow morning. The whole reason this is computed in the database rather
 * than eyeballed from a list of uploads is that it can produce the second.
 */
export function ReadinessPanel({
  readiness,
  lines,
  frozenAt,
  rules,
  locale = "ar",
}: {
  readiness: ExportOfferReadiness;
  lines: ExportReadinessLine[];
  /** When the list was copied onto the offer, if it has been. */
  frozenAt?: string | null;
  /** متى رُوجعت قواعدُ هذا الممرّ آخرَ مرّة — وهل تأخّرت. */
  rules?: ExportCorridorRulesStatus | null;
  locale?: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const tone = readiness.ready
    ? "border-primary/40 bg-primary/5"
    : "border-border bg-card";

  return (
    <section className={`mt-6 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{t("جاهزيّةُ المستندات", "Document readiness")}</h2>
        <span className="text-sm text-muted">
          {readiness.score}
          {en ? "%" : "٪"}
        </span>
      </div>

      <p className={`mt-1 text-sm ${readiness.ready ? "" : "text-danger"}`}>
        <strong>{readinessVerdict(readiness, locale)}</strong>
      </p>

      {/* Progress, not a verdict — which is why it carries no colour of its
          own and sits below the sentence rather than above it. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background"
        role="img"
        aria-label={
          en
            ? `${readiness.score} percent of the documents' weight is complete`
            : `اكتمل ${readiness.score} بالمئة من وزن المستندات`
        }
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      {lines.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.document_type_id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={l.satisfied ? "text-primary" : "text-danger"}
              >
                {l.satisfied ? "✓" : "✗"}
              </span>
              <span>
                <span className={l.satisfied ? "" : "font-medium"}>
                  {referenceName(l.code, l.name_ar, locale)}
                </span>{" "}
                <span className="text-xs text-muted">
                  ({readinessModeLabel(l.mode, locale)})
                </span>
                <span className="sr-only">
                  {l.satisfied ? t(" — مرفوع", " — uploaded") : t(" — ناقص", " — missing")}
                </span>
                {l.note_ar && (
                  <span className="block text-xs text-muted">
                    {referenceNote(l.code, l.note_ar, locale)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted">
        {(en ? READINESS_SOURCE_NOTE_EN : READINESS_SOURCE_NOTE)[readiness.source]}
        {readiness.source === "frozen" && frozenAt
          ? ` (${new Date(frozenAt).toLocaleString(en ? "en-GB" : "ar-EG")})`
          : ""}
      </p>

      {/*
        عمرُ اللائحةِ يسافر مع الرقم.
        The person who pays for a stale rule is the one shipping the goods, so
        telling only the administrators that a corridor is overdue puts the
        knowledge where the loss is not. A corridor past its review interval says
        so here, beside the number computed from it, instead of letting «٧ من ٨»
        imply a currency nobody has checked.
      */}
      {rules && (
        <p
          className={`mt-2 text-xs ${rules.stale ? "text-danger" : "text-muted"}`}
        >
          {rules.last_reviewed_at
            ? rules.stale
              ? en
                ? `⚠ This corridor's rules have not been reviewed for ${rules.days_since} days — the limit is ${rules.review_days}. They may have changed.`
                : `⚠ قواعدُ هذا الممرّ لم تُراجَع منذ ${rules.days_since} يوماً — والحدُّ ${rules.review_days}. قد تكون تغيّرت.`
              : en
                ? `This corridor's rules were reviewed ${rules.days_since} days ago.`
                : `قواعدُ هذا الممرّ رُوجعت قبل ${rules.days_since} يوماً.`
            : t(
                "⚠ قواعدُ هذا الممرّ لم تُراجَع بعد — تحقّق منها قبل الشحن.",
                "⚠ This corridor's rules have not been reviewed yet — check them before shipping.",
              )}
        </p>
      )}
    </section>
  );
}

/**
 * The same judgement in one line, for a list of offers.
 *
 * Shows the percentage only when the offer is ready. An unready offer's score is
 * the number that misleads — a buyer scanning a list has no room for the caveat,
 * so the list says «مستنداتٌ ناقصة» and the offer's own page explains which.
 */
export function ReadinessBadge({
  readiness,
  locale = "ar",
}: {
  readiness: ExportOfferReadiness;
  locale?: Locale;
}) {
  if (readiness.required_total === 0) return null;
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return readiness.ready ? (
    <span className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary">
      {t("مستنداتُه كاملة", "Documents complete")} · {readiness.required_met}/{readiness.required_total}
    </span>
  ) : (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      {t("مستنداتٌ ناقصة", "Documents missing")} · {readiness.required_met}/{readiness.required_total}
    </span>
  );
}
