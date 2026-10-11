"use client";

import { useActionState, useState } from "react";
import Explain, { Steps } from "@/components/Explain";
import {
  SPECIES,
  SPECIES_LABEL_EN,
  PURPOSE_LABEL,
  PURPOSE_LABEL_EN,
  HERD_STAGE_LABEL_EN,
  planHerd,
  type SpeciesProfile,
} from "@/lib/livestock";
import type { HerdPurpose, LivestockSpecies } from "@/types/database";
import { createHerd, type ActionResult } from "@/app/herds/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

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
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

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
        <Steps
          steps={[
            t("بيانات الدورة", "Cycle details"),
            t("مراجعة الخطة", "Review the plan"),
          ]}
          current={plan ? 1 : 0}
        />

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">{t("الدورة", "Cycle")}</legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("اسم الدورة", "Cycle name")}
            <input
              name="name"
              required
              className={field}
              placeholder={t(
                "مثال: تسمين ضأن — دورة الخريف ٢٠٢٦",
                "e.g. Sheep fattening — autumn 2026 cycle",
              )}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("النوع", "Species")}
            <select
              name="species"
              value={species}
              onChange={(e) => setSpecies(e.target.value as LivestockSpecies)}
              className={field}
            >
              {SPECIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {en ? SPECIES_LABEL_EN[s.key] : s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("الغرض", "Purpose")}
            <select
              name="purpose"
              value={activePurpose}
              onChange={(e) => setPurpose(e.target.value as HerdPurpose)}
              className={field}
            >
              {purposes.map((p) => (
                <option key={p} value={p}>
                  {(en ? PURPOSE_LABEL_EN : PURPOSE_LABEL)[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("السلالة", "Breed")}
            <input
              name="breed"
              className={field}
              placeholder={t("مثال: حمري", "e.g. Hamari")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("عدد الرؤوس", "Number of head")}
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
            {t("تاريخ البدء", "Start date")}
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
            {t("الميزانية للرأس", "Budget per head")}
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
              {t("المشروع المرتبط", "Linked project")}
              <select name="project_id" defaultValue="" className={field}>
                <option value="">{t("بدون مشروع", "No project")}</option>
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
        <h2 className="text-sm font-bold">{t("خطة الدورة", "Cycle plan")}</h2>

        {!plan ? (
          <p className="text-sm text-muted">
            {t("أكمل البيانات لتظهر الخطة.", "Complete the details to see the plan.")}
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-2 text-sm">
              {plan.stages.map((s) => (
                <li
                  key={s.key}
                  className="flex items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <span>
                    {s.order}. {en ? HERD_STAGE_LABEL_EN[s.key] : s.name}
                    <span className="mt-0.5 block text-xs text-muted">
                      {en
                        ? `${s.days} days — from ${s.startDate}`
                        : `${s.days} يوم — من ${s.startDate}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {n0(s.feedKg)} {t("كجم", "kg")}
                  </span>
                </li>
              ))}
            </ol>

            <div className="border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{t("مدة الدورة", "Cycle length")}</span>
                <span>
                  {t("حتى", "Until")} {plan.endDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {t("إجمالي العلف التقديري", "Total estimated feed")}
                </span>
                <span className="font-medium">
                  {n0(plan.totalFeedKg)} {t("كجم", "kg")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {t("وحدة الضأن الجافة (DSE)", "Dry sheep equivalent (DSE)")}
                </span>
                <span className="font-medium">{plan.dse}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {t("الوحدات الحيوانية (UA)", "Animal units (UA)")}
                </span>
                <span className="font-medium">{plan.animalUnits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {t("مرعى مطلوب", "Pasture needed")}
                </span>
                <span className="font-medium">
                  {plan.pastureHectares.low}–{plan.pastureHectares.high}{" "}
                  {t("هكتار", "ha")}
                </span>
              </div>
              {plan.totalBudget > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">
                    {t("إجمالي الميزانية", "Total budget")}
                  </span>
                  <span className="font-medium">{n0(plan.totalBudget)}</span>
                </div>
              )}
            </div>

            {plan.breeds.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-xs font-medium">
                  {t("سلالات سودانية", "Sudanese breeds")}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted" {...arText}>
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
              {en ? (
                <>
                  The figures are derived from published references: the dry
                  sheep equivalent (DSE) from Meat &amp; Livestock Australia; the
                  450 kg animal unit and tropical stocking rates from Brazil’s
                  Embrapa; and the 35–50% higher intake of lactating animals from
                  the US NRC. Maintenance energy scales with metabolic weight
                  (W<sup>0.75</sup>), not with body weight directly. Treat them
                  as a <strong>starting point</strong>{" "}
                  to be calibrated against your herd and the quality of your
                  feed — no published Sudanese feeding standard exists at this
                  level of detail.
                </>
              ) : (
                <>
                  الأرقام مشتقّة من مرجعيات منشورة: وحدة الضأن الجافة (DSE) من هيئة
                  اللحوم والثروة الحيوانية الأسترالية، والوحدة الحيوانية ٤٥٠ كجم
                  وحمولة المراعي المدارية من إمبرابا البرازيلية، وزيادة استهلاك
                  الحلوب ٣٥–٥٠٪ من NRC الأمريكي. وطاقة الإعاشة تتدرّج مع وزن الأيض
                  (W<sup>0.75</sup>) لا مع الوزن مباشرة. تبقى <strong>نقطة بداية</strong>{" "}
                  تُعايَر على قطيعك وجودة علفك — لا يوجد معيار تغذية سوداني منشور
                  بهذه الدقة.
                </>
              )}
            </Explain>
          </>
        )}

        <button
          type="submit"
          disabled={pending || !plan}
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending
            ? t("جارٍ الإنشاء...", "Creating...")
            : t("أنشئ الدورة", "Create the cycle")}
        </button>
      </aside>
    </form>
  );
}
