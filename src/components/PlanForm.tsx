"use client";

import Link from "next/link";
import { useState } from "react";
import { generatePlan, type PlanResult } from "@/app/plan/actions";
import { formatUsd, riskLabel } from "@/lib/format";

export default function PlanForm() {
  const [result, setResult] = useState<PlanResult | { error: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

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
          المبلغ الذي تريد استثماره (USD)
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
            ما أفقك الزمني للاستثمار؟
          </legend>
          {[
            ["1", "أقل من سنة"],
            ["2", "من سنة إلى 3 سنوات"],
            ["3", "أكثر من 3 سنوات"],
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
            لو انخفضت قيمة استثمارك 20% مؤقتاً، ماذا تفعل؟
          </legend>
          {[
            ["1", "أسحب استثماري فوراً"],
            ["2", "أنتظر وأراقب الوضع"],
            ["3", "أزيد استثماري إن أمكن"],
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
            كم نسبة هذا المبلغ من أموالك الفائضة (غير الأساسية للمعيشة)؟
          </legend>
          {[
            ["1", "أقل من 10%"],
            ["2", "بين 10% و30%"],
            ["3", "أكثر من 30%"],
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
          {loading ? "جارٍ الحساب..." : "اقترح لي توزيعاً"}
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
              مستوى تحمّل المخاطرة المُستنتج من إجاباتك:{" "}
              <span className="font-bold text-primary">
                {riskLabel(result.riskProfile)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              هذا اقتراح توزيع آلي وليس نصيحة مالية ملزمة — راجعه وقرّر بنفسك
              قبل أي استثمار فعلي.
            </p>
          </div>

          {result.allocations.length === 0 ? (
            <p className="text-sm text-muted">
              لا توجد مشاريع مفتوحة كافية حالياً لاقتراح توزيع.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card text-right">
                  <tr>
                    <th className="px-4 py-3">المشروع</th>
                    <th className="px-4 py-3">المخاطرة</th>
                    <th className="px-4 py-3">الحصص المقترحة</th>
                    <th className="px-4 py-3">المبلغ</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocations.map((a) => (
                    <tr key={a.project.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        {a.project.name}
                      </td>
                      <td className="px-4 py-3">
                        {riskLabel(a.project.risk_level)}
                      </td>
                      <td className="px-4 py-3">{a.shares}</td>
                      <td className="px-4 py-3">{formatUsd(a.amount)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${a.project.slug}`}
                          className="text-primary underline"
                        >
                          عرض المشروع
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-4 py-3" colSpan={3}>
                      الإجمالي المُوزَّع من أصل{" "}
                      {formatUsd(result.requestedAmount)}
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      {formatUsd(result.allocatedAmount)}
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
