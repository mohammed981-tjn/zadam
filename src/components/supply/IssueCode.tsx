"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { issueDeliveryCode } from "@/app/suppliers/actions";

/**
 * The recipient's six-digit handover code. The database keeps only a salted
 * hash, so the code exists in clear on this screen and nowhere else; pressing
 * again issues a new one and the old one stops working.
 */
export default function IssueCode({ deliveryId }: { deliveryId: string }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const r = await issueDeliveryCode(deliveryId);
      if (r.code) setCode(r.code);
      else setError(r.error ?? t("تعذّر إصدار الرمز.", "Could not issue the code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {code && (
        <p className="rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 text-center">
          <span className="block text-xs text-muted">{t("رمز الاستلام — أعطه للسائق وحده عند وصول البضاعة", "Handover code — give it only to the driver when the goods arrive")}</span>
          <span className="figure mt-1 block text-3xl font-black tracking-[0.4em]" dir="ltr">
            {code}
          </span>
        </p>
      )}
      <button
        type="button"
        onClick={issue}
        disabled={busy}
        className="self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "…" : code ? t("أصدر رمزاً جديداً (يُبطل السابق)", "Issue a new code (cancels the old one)") : t("أظهر رمز الاستلام", "Show my handover code")}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-muted">
        {t(
          "لا تعطِ الرمز قبل أن ترى بضاعتك بعينك. لا نحفظه مقروءاً، فإن نسيته أصدر غيره.",
          "Do not give the code before you see your goods with your own eyes. We do not keep it readable, so if you forget it, issue another.",
        )}
      </p>
    </div>
  );
}
