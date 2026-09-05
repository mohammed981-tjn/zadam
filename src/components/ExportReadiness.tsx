import {
  READINESS_MODE_LABEL,
  READINESS_SOURCE_NOTE,
  readinessVerdict,
  type ExportOfferReadiness,
} from "@/lib/exportReadiness";
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
}: {
  readiness: ExportOfferReadiness;
  lines: ExportReadinessLine[];
  /** When the list was copied onto the offer, if it has been. */
  frozenAt?: string | null;
  /** متى رُوجعت قواعدُ هذا الممرّ آخرَ مرّة — وهل تأخّرت. */
  rules?: ExportCorridorRulesStatus | null;
}) {
  const tone = readiness.ready
    ? "border-primary/40 bg-primary/5"
    : "border-border bg-card";

  return (
    <section className={`mt-6 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">جاهزيّةُ المستندات</h2>
        <span className="text-sm text-muted">{readiness.score}٪</span>
      </div>

      <p className={`mt-1 text-sm ${readiness.ready ? "" : "text-danger"}`}>
        <strong>{readinessVerdict(readiness)}</strong>
      </p>

      {/* Progress, not a verdict — which is why it carries no colour of its
          own and sits below the sentence rather than above it. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background"
        role="img"
        aria-label={`اكتمل ${readiness.score} بالمئة من وزن المستندات`}
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
                  {l.name_ar}
                </span>{" "}
                <span className="text-xs text-muted">
                  ({READINESS_MODE_LABEL[l.mode] ?? l.mode})
                </span>
                <span className="sr-only">
                  {l.satisfied ? " — مرفوع" : " — ناقص"}
                </span>
                {l.note_ar && (
                  <span className="block text-xs text-muted">{l.note_ar}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted">
        {READINESS_SOURCE_NOTE[readiness.source]}
        {readiness.source === "frozen" && frozenAt
          ? ` (${new Date(frozenAt).toLocaleString("ar-EG")})`
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
              ? `⚠ قواعدُ هذا الممرّ لم تُراجَع منذ ${rules.days_since} يوماً — والحدُّ ${rules.review_days}. قد تكون تغيّرت.`
              : `قواعدُ هذا الممرّ رُوجعت قبل ${rules.days_since} يوماً.`
            : "⚠ قواعدُ هذا الممرّ لم تُراجَع بعد — تحقّق منها قبل الشحن."}
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
export function ReadinessBadge({ readiness }: { readiness: ExportOfferReadiness }) {
  if (readiness.required_total === 0) return null;

  return readiness.ready ? (
    <span className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary">
      مستنداتُه كاملة · {readiness.required_met}/{readiness.required_total}
    </span>
  ) : (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      مستنداتٌ ناقصة · {readiness.required_met}/{readiness.required_total}
    </span>
  );
}
