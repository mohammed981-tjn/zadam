"use client";

import { useState } from "react";
import { submitInterest, type InterestResult } from "@/app/export/market/actions";

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

  async function submit(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      const outcome = await submitInterest(offerId, formData);
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    } catch {
      setResult({ ok: false, message: "تعذّر الوصول إلى الخادم. أعد المحاولة." });
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
          أنا مهتمّ بهذا العرض
        </button>
      )}

      {open && (
        <form action={submit} className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            بشأن العرض <span className="font-mono">{reference}</span>. لا يلزمك
            حساب.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`name-${offerId}`}>
                الاسم *
              </label>
              <input id={`name-${offerId}`} name="buyer_name" className={field} required />
            </div>
            <div>
              <label className={label} htmlFor={`company-${offerId}`}>
                الشركة
              </label>
              <input id={`company-${offerId}`} name="buyer_company" className={field} />
            </div>
            <div>
              <label className={label} htmlFor={`email-${offerId}`}>
                البريد الإلكتروني
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
                الهاتف
              </label>
              <input id={`phone-${offerId}`} name="buyer_phone" className={field} dir="ltr" />
            </div>
            <div>
              <label className={label} htmlFor={`country-${offerId}`}>
                بلد الاستيراد
              </label>
              <input id={`country-${offerId}`} name="buyer_country" className={field} />
            </div>
            <div>
              <label className={label} htmlFor={`qty-${offerId}`}>
                الكمّية المطلوبة
              </label>
              <input
                id={`qty-${offerId}`}
                name="quantity_wanted"
                className={field}
                inputMode="decimal"
                placeholder="اتركها فارغة إن أردت الكمّية كاملة"
              />
            </div>
          </div>

          <p className="text-xs text-muted">* البريد أو الهاتف — أحدهما يكفي.</p>

          <div>
            <label className={label} htmlFor={`msg-${offerId}`}>
              رسالتك
            </label>
            <textarea id={`msg-${offerId}`} name="message" className={field} rows={3} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "جارٍ الإرسال…" : "أرسل الطلب"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              إلغاء
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
