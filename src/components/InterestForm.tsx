"use client";

import { useState } from "react";
import { submitInterest, type InterestResult } from "@/app/export/market/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/**
 * نموذجُ طلب الاهتمام على عرضٍ منشور.
 *
 * WHY IT IS FOLDED AWAY UNTIL PRESSED
 *
 * The market page is read as a list — a buyer scans several offers before
 * caring about one. Six form fields under every card turns a list into a wall
 * and buries the offers themselves.
 *
 * WHY IT ASKS FOR SO LITTLE
 *
 * Every field is a chance to close the tab. Name, one way to reach them, and
 * whatever they want to say — that is enough for a person to answer them.
 * Company, country and quantity are offered because a serious buyer fills them
 * in unprompted and they make the reply better, but none of them is required,
 * because a buyer who will not name their company is still a buyer.
 */
export default function InterestForm({
  offerId,
  reference,
}: {
  offerId: string;
  reference: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<InterestResult | null>(null);
  const [pending, setPending] = useState(false);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  async function submit(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      const outcome = await submitInterest(offerId, formData);
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    } catch {
      setResult({
        ok: false,
        message: t("تعذّر الوصول إلى الخادم. أعد المحاولة.", "Could not reach the server. Try again."),
      });
    } finally {
      setPending(false);
    }
  }

  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";
  const label = "block text-xs font-medium";

  return (
    <div className="mt-4 border-t border-border pt-3">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("أنا مهتمّ بهذا العرض", "I'm interested in this offer")}
        </button>
      )}

      {open && (
        <form action={submit} className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            {t("بشأن العرض", "About offer")} <span className="font-mono">{reference}</span>.{" "}
            {t("لا يلزمك حساب.", "No account needed.")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`name-${offerId}`}>
                {t("الاسم *", "Name *")}
              </label>
              <input id={`name-${offerId}`} name="buyer_name" className={field} required />
            </div>
            <div>
              <label className={label} htmlFor={`company-${offerId}`}>
                {t("الشركة", "Company")}
              </label>
              <input id={`company-${offerId}`} name="buyer_company" className={field} />
            </div>
            <div>
              <label className={label} htmlFor={`email-${offerId}`}>
                {t("البريد الإلكتروني", "Email")}
              </label>
              <input
                id={`email-${offerId}`}
                name="buyer_email"
                type="email"
                className={field}
                dir="ltr"
              />
            </div>
            <div>
              <label className={label} htmlFor={`phone-${offerId}`}>
                {t("الهاتف", "Phone")}
              </label>
              <input id={`phone-${offerId}`} name="buyer_phone" className={field} dir="ltr" />
            </div>
            <div>
              <label className={label} htmlFor={`country-${offerId}`}>
                {t("بلد الاستيراد", "Importing country")}
              </label>
              <input id={`country-${offerId}`} name="buyer_country" className={field} />
            </div>
            <div>
              <label className={label} htmlFor={`qty-${offerId}`}>
                {t("الكمّية المطلوبة", "Quantity wanted")}
              </label>
              <input
                id={`qty-${offerId}`}
                name="quantity_wanted"
                className={field}
                inputMode="decimal"
                placeholder={t("اتركها فارغة إن أردت الكمّية كاملة", "Leave empty if you want the whole quantity")}
              />
            </div>
          </div>

          <p className="text-xs text-muted">
            {t("* البريد أو الهاتف — أحدهما يكفي.", "* Email or phone — either one is enough.")}
          </p>

          <div>
            <label className={label} htmlFor={`msg-${offerId}`}>
              {t("رسالتك", "Your message")}
            </label>
            <textarea id={`msg-${offerId}`} name="message" className={field} rows={3} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? t("جارٍ الإرسال…", "Sending…") : t("أرسل الطلب", "Send request")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              {t("إلغاء", "Cancel")}
            </button>
          </div>
        </form>
      )}

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
