"use client";

import { useActionState, useState } from "react";
import { createPriceAlert, type AlertResult } from "@/app/market/alerts/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { button, field, label } from "@/lib/ui";

export interface SubjectOption {
  value: string;
  label: string;
  unit: string;
  /** The newest published price, so the form can show what the limit is measured against. */
  price: number;
  date: string;
}

/** «نبّهني» (البند ١٦٦): اختر الصنف، فوق أم تحت، والحدّ بالجنيه. */
export default function PriceAlertForm({ options }: { options: SubjectOption[] }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [state, action, pending] = useActionState<AlertResult | null, FormData>(createPriceAlert, null);
  const [subject, setSubject] = useState(options[0]?.value ?? "");
  const chosen = options.find((o) => o.value === subject);

  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className={`${label} sm:col-span-2`}>
        {t("أيّ سعر تتابع؟", "Which price?")}
        <select name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="text-sm text-muted sm:col-span-2" dir="auto">
          {t("آخر سعرٍ منشور", "Latest published price")}: <b dir="ltr">{chosen.price.toLocaleString("en-US")}</b> {chosen.unit} · {chosen.date}
        </p>
      )}
      <label className={label}>
        {t("نبّهني حين يصير السعر…", "Tell me when the price goes…")}
        <select name="direction" defaultValue="above" className={field}>
          <option value="above">{t("فوق الحدّ", "above the limit")}</option>
          <option value="below">{t("تحت الحدّ", "below the limit")}</option>
        </select>
      </label>
      <label className={label}>
        {t("الحدّ (بالجنيه)", "The limit (in pounds)")}
        <input name="threshold" inputMode="numeric" required className={field} dir="ltr" placeholder="600000" />
      </label>
      {state && (
        <p className={`text-sm sm:col-span-2 ${state.ok ? "text-primary" : "text-danger"}`} role="status">
          {state.message}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={pending} className={button}>
          {pending ? t("جارٍ الحفظ…", "Saving…") : t("أضف التنبيه", "Add the alert")}
        </button>
      </div>
    </form>
  );
}
