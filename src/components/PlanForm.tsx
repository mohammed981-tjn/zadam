"use client";

import Link from "next/link";
import { useState } from "react";
import { generatePlan, type PlanResult } from "@/app/plan/actions";
import { formatUsd, riskLabel } from "@/lib/format";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

export default function PlanForm() {
  const [result, setResult] = useState<PlanResult | { error: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setResult(await generatePlan(formData));
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        action={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("المبلغ الذي تريد استثماره (USD)", "Amount you want to invest (USD)")}
          <input
            type="number"
            name="amount"
            min={50}
            step="1"
            required
            defaultValue={500}
            className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("ما أفقك الزمني للاستثمار؟", "What is your investment time horizon?")}
          </legend>
          {[
            ["1", t("أقل من سنة", "Less than a year")],
            ["2", t("من سنة إلى 3 سنوات", "One to 3 years")],
            ["3", t("أكثر من 3 سنوات", "More than 3 years")],
          ].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="q1"
                value={v}
                required
                defaultChecked={v === "2"}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("لو انخفضت قيمة استثمارك 20% مؤقتاً، ماذا تفعل؟", "If your investment temporarily lost 20% of its value, what would you do?")}
          </legend>
          {[
            ["1", t("أسحب استثماري فوراً", "Withdraw my investment right away")],
            ["2", t("أنتظر وأراقب الوضع", "Wait and watch")],
            ["3", t("أزيد استثماري إن أمكن", "Invest more if I can")],
          ].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="q2"
                value={v}
                required
                defaultChecked={v === "2"}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t(
              "كم نسبة هذا المبلغ من أموالك الفائضة (غير الأساسية للمعيشة)؟",
              "What share of your spare money (not needed for living costs) is this amount?",
            )}
          </legend>
          {[
            ["1", t("أقل من 10%", "Less than 10%")],
            ["2", t("بين 10% و30%", "Between 10% and 30%")],
            ["3", t("أكثر من 30%", "More than 30%")],
          ].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="q3"
                value={v}
                required
                defaultChecked={v === "2"}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t("جارٍ الحساب...", "Calculating...") : t("اقترح لي توزيعاً", "Suggest a split")}
        </button>
      </form>

      {result && "error" in result && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {result.error}
        </p>
      )}

      {result && "allocations" in result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm">
              {t("مستوى تحمّل المخاطرة المُستنتج من إجاباتك:", "Risk tolerance inferred from your answers:")}{" "}
              <span className="font-bold text-primary">
                {riskLabel(result.riskProfile, locale)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {t(
                "هذا اقتراح توزيع آلي وليس نصيحة مالية ملزمة — راجعه وقرّر بنفسك قبل أي استثمار فعلي.",
                "This is an automatic suggestion, not binding financial advice — review it and decide for yourself before investing.",
              )}
            </p>
          </div>

          {result.allocations.length === 0 ? (
            <p className="text-sm text-muted">
              {t(
                "لا توجد مشاريع مفتوحة كافية حالياً لاقتراح توزيع.",
                "There are not enough open projects right now to suggest a split.",
              )}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card text-start">
                  <tr>
                    <th className="px-4 py-3">{t("المشروع", "Project")}</th>
                    <th className="px-4 py-3">{t("المخاطرة", "Risk")}</th>
                    <th className="px-4 py-3">{t("الحصص المقترحة", "Suggested shares")}</th>
                    <th className="px-4 py-3">{t("المبلغ", "Amount")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocations.map((a) => (
                    <tr key={a.project.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium" {...arText}>
                        {a.project.name}
                      </td>
                      <td className="px-4 py-3">
                        {riskLabel(a.project.risk_level, locale)}
                      </td>
                      <td className="px-4 py-3">{a.shares}</td>
                      <td className="px-4 py-3">{formatUsd(a.amount, locale)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${a.project.slug}`}
                          className="text-primary underline"
                        >
                          {t("عرض المشروع", "View project")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-4 py-3" colSpan={3}>
                      {t("الإجمالي المُوزَّع من أصل", "Total allocated out of")}{" "}
                      {formatUsd(result.requestedAmount, locale)}
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      {formatUsd(result.allocatedAmount, locale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
