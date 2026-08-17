"use client";

import { useActionState, useState } from "react";
import Explain, { Steps } from "@/components/Explain";
import {
  SPECIES,
  PURPOSE_LABEL,
  planHerd,
  type SpeciesProfile,
} from "@/lib/livestock";
import type { HerdPurpose, LivestockSpecies } from "@/types/database";
import { createHerd, type ActionResult } from "@/app/herds/actions";

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function HerdForm({
  today,
  projects = [],
}: {
  today: string;
  projects?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createHerd, null);

  const [species, setSpecies] = useState<LivestockSpecies>("sheep");
  const [purpose, setPurpose] = useState<HerdPurpose>("fattening");
  const [headCount, setHeadCount] = useState(100);
  const [startDate, setStartDate] = useState(today);
  const [budgetPerHead, setBudgetPerHead] = useState(0);

  const profile: SpeciesProfile | undefined = SPECIES.find(
    (s) => s.key === species,
  );

  // Purposes are not a fixed list: a camel is not kept for eggs, and offering
  // the choice would only produce a plan that cannot be built.
  const purposes = profile?.purposes ?? [];
  const activePurpose = purposes.includes(purpose) ? purpose : purposes[0];

  // Left to the React Compiler rather than a manual useMemo: activePurpose is
  // derived from the species list above, and hand-written dependencies on a
  // derived value are exactly what the compiler refuses to preserve.
  const plan = activePurpose
    ? planHerd(species, activePurpose, headCount, startDate, budgetPerHead)
    : null;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <Steps steps={["بيانات الدورة", "مراجعة الخطة"]} current={plan ? 1 : 0} />

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">الدورة</legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            اسم الدورة
            <input
              name="name"
              required
              className={field}
              placeholder="مثال: تسمين ضأن — دورة الخريف ٢٠٢٦"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            النوع
            <select
              name="species"
              value={species}
              onChange={(e) => setSpecies(e.target.value as LivestockSpecies)}
              className={field}
            >
              {SPECIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            الغرض
            <select
              name="purpose"
              value={activePurpose}
              onChange={(e) => setPurpose(e.target.value as HerdPurpose)}
              className={field}
            >
              {purposes.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            السلالة
            <input name="breed" className={field} placeholder="مثال: حمري" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            عدد الرؤوس
            <input
              name="head_count"
              type="number"
              min={1}
              required
              value={headCount}
              onChange={(e) => setHeadCount(Number(e.target.value))}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            تاريخ البدء
            <input
              name="start_date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            الميزانية للرأس
            <input
              name="budget_per_head"
              type="number"
              min={0}
              value={budgetPerHead || ""}
              onChange={(e) => setBudgetPerHead(Number(e.target.value))}
              className={field}
            />
          </label>

          {projects.length > 0 && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              المشروع المرتبط
              <select name="project_id" defaultValue="" className={field}>
                <option value="">بدون مشروع</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        {state && !state.ok && (
          <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
            {state.message}
          </p>
        )}
      </div>

      <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-bold">خطة الدورة</h2>

        {!plan ? (
          <p className="text-sm text-muted">أكمل البيانات لتظهر الخطة.</p>
        ) : (
          <>
            <ol className="flex flex-col gap-2 text-sm">
              {plan.stages.map((s) => (
                <li
                  key={s.key}
                  className="flex items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <span>
                    {s.order}. {s.name}
                    <span className="mt-0.5 block text-xs text-muted">
                      {s.days} يوم — من {s.startDate}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {n0(s.feedKg)} كجم
                  </span>
                </li>
              ))}
            </ol>

            <div className="border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">مدة الدورة</span>
                <span>حتى {plan.endDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">إجمالي العلف التقديري</span>
                <span className="font-medium">{n0(plan.totalFeedKg)} كجم</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">وحدة الضأن الجافة (DSE)</span>
                <span className="font-medium">{plan.dse}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">الوحدات الحيوانية (UA)</span>
                <span className="font-medium">{plan.animalUnits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">مرعى مطلوب</span>
                <span className="font-medium">
                  {plan.pastureHectares.low}–{plan.pastureHectares.high} هكتار
                </span>
              </div>
              {plan.totalBudget > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">إجمالي الميزانية</span>
                  <span className="font-medium">{n0(plan.totalBudget)}</span>
                </div>
              )}
            </div>

            {plan.breeds.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-xs font-medium">سلالات سودانية</p>
                <ul className="flex flex-col gap-1 text-xs text-muted">
                  {plan.breeds.map((b) => (
                    <li key={b.name}>
                      <strong className="text-foreground">{b.name}</strong> —{" "}
                      {b.region}. {b.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Explain tone="warn">
              {/* Named sources, because the crop side names FAO-56 and a figure
                  whose provenance is not stated cannot be argued with. */}
              الأرقام مشتقّة من مرجعيات منشورة: وحدة الضأن الجافة (DSE) من هيئة
              اللحوم والثروة الحيوانية الأسترالية، والوحدة الحيوانية ٤٥٠ كجم
              وحمولة المراعي المدارية من إمبرابا البرازيلية، وزيادة استهلاك
              الحلوب ٣٥–٥٠٪ من NRC الأمريكي. وطاقة الإعاشة تتدرّج مع وزن الأيض
              (W<sup>0.75</sup>) لا مع الوزن مباشرة. تبقى <strong>نقطة بداية</strong>{" "}
              تُعايَر على قطيعك وجودة علفك — لا يوجد معيار تغذية سوداني منشور
              بهذه الدقة.
            </Explain>
          </>
        )}

        <button
          type="submit"
          disabled={pending || !plan}
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "جارٍ الإنشاء..." : "أنشئ الدورة"}
        </button>
      </aside>
    </form>
  );
}
