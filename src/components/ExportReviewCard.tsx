"use client";

import { useState } from "react";
import { reviewOffer, type ReviewResult } from "@/app/admin/export/actions";
import { MIN_REJECTION_REASON } from "@/lib/exportOffers";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/**
 * قرارُ المراجعة في بطاقةٍ واحدة.
 *
 * The two buttons are not symmetrical, and that asymmetry is the design.
 * Publishing takes one press; returning an offer requires a written reason
 * first. That is the cheaper act being the one that costs the farmer nothing to
 * recover from, and the costly one being the act that leaves them guessing.
 *
 * The length is checked here and again by a database constraint. This one
 * exists for the sentence; that one exists because a screen is not a boundary.
 */
export default function ExportReviewCard({ offerId }: { offerId: string }) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [pending, setPending] = useState<"publish" | "return" | null>(null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const reasonReady = reason.trim().length >= MIN_REJECTION_REASON;

  async function decide(decision: "publish" | "return") {
    if (pending) return;
    setPending(decision);
    try {
      setResult(await reviewOffer(offerId, decision, reason));
    } catch {
      setResult({ ok: false, message: t("تعذّر الوصول إلى الخادم. أعد المحاولة.", "Could not reach the server. Try again.") });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <label className="block text-sm font-medium" htmlFor={`reason-${offerId}`}>
        {t("سبب الإعادة — يقرأه المزارع", "Reason for returning — the farmer reads it")}
      </label>
      <textarea
        id={`reason-${offerId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        placeholder={t(
          "مثال: الشهادة البيطرية منتهية الصلاحية — أرفق واحدةً سارية يوم الشحن.",
          "Example: the veterinary certificate has expired — attach one valid on the shipping day.",
        )}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide("publish")}
          disabled={pending !== null}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending === "publish" ? t("جارٍ النشر…", "Publishing…") : t("انشر", "Publish")}
        </button>

        <button
          type="button"
          onClick={() => decide("return")}
          disabled={pending !== null || !reasonReady}
          title={reasonReady ? undefined : t("اكتب السبب أوّلاً", "Write the reason first")}
          className="rounded-lg border border-danger/50 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-40"
        >
          {pending === "return" ? t("جارٍ الإعادة…", "Returning…") : t("أعده بالسبب", "Return with the reason")}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted">
        {locale === "en" ? (
          <>
            Publishing attests that <strong>the evidence supports the claims</strong> — not that the
            goods are good or the price fair. Those are for the buyer and their inspection.
          </>
        ) : (
          <>
            النشرُ يشهد أنّ <strong>الأدلّة تسند الدعاوى</strong> — لا أنّ البضاعة
            جيّدة ولا أنّ السعر عادل. تلك للمشتري وفحصِه.
          </>
        )}
      </p>

      {result && (
        <p
          role="status"
          className={`mt-2 text-sm ${result.ok ? "text-muted" : "text-danger"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
