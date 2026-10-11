"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { planSeason } from "@/lib/season";
import { createSeason, type ActionResult } from "@/app/seasons/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import {
  cropName,
  irrigationLabel,
  stageName,
  stationName,
} from "@/lib/farmLabelsEn";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export interface SeasonProjectOption {
  id: string;
  name: string;
}

export default function SeasonForm({
  today,
  projects = [],
}: {
  today: string;
  /**
   * Projects this season may be attached to. Empty is normal — a farmer
   * planning ahead of any investor is the common case, and the field stays
   * optional so the season can be raised either way.
   */
  projects?: SeasonProjectOption[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createSeason, null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arrow = locale === "en" ? "→" : "←";

  const [cropKey, setCropKey] = useState("wheat");
  const [stationKey, setStationKey] = useState("gezira");
  const [plantingDate, setPlantingDate] = useState(today);
  const [irrigation, setIrrigation] = useState<IrrigationMethod>("flood");
  const [feddans, setFeddans] = useState(20);
  const [budget, setBudget] = useState(120);

  // The plan the farmer will get, computed as they choose — no surprises after
  // submitting.
  const plan = useMemo(
    () =>
      planSeason(
        cropKey,
        stationKey,
        plantingDate,
        irrigation,
        feddans,
        budget,
      ),
    [cropKey, stationKey, plantingDate, irrigation, feddans, budget],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <form action={formAction} className="flex flex-col gap-5">
        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">{t("الموسم", "Season")}</legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("اسم الموسم", "Season name")}
            <input
              name="name"
              required
              className={field}
              placeholder={t(
                "مثال: قمح شتوي ٢٠٢٦ — حقل الشمال",
                "e.g. Winter wheat 2026 — North field",
              )}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("الموقع", "Location")}
            <input
              name="location"
              className={field}
              placeholder={t("القرية والمحلية", "Village and locality")}
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
              <span className="text-xs text-muted">
                {t(
                  "اربط الموسم بمشروع ليظهر تقدّمه للمستثمرين، وليمكن التعاقد على خدماته بالمراحل.",
                  "Link the season to a project so investors can see its progress, and so its services can be contracted stage by stage.",
                )}
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            {t("المحصول", "Crop")}
            <select
              name="crop_key"
              value={cropKey}
              onChange={(e) => setCropKey(e.target.value)}
              className={field}
            >
              {CROPS.map((c) => (
                <option key={c.key} value={c.key}>
                  {cropName(c.key, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("المنطقة", "Zone")}
            <select
              name="station_key"
              value={stationKey}
              onChange={(e) => setStationKey(e.target.value)}
              className={field}
            >
              {STATIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {stationName(s.key, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("تاريخ الزراعة", "Planting date")}
            <input
              type="date"
              name="planting_date"
              value={plantingDate}
              onChange={(e) => setPlantingDate(e.target.value)}
              required
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("طريقة الري", "Irrigation method")}
            <select
              name="irrigation"
              value={irrigation}
              onChange={(e) =>
                setIrrigation(e.target.value as IrrigationMethod)
              }
              className={field}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {irrigationLabel(m, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("المساحة (فدان)", "Area (feddans)")}
            <input
              type="number"
              name="feddans"
              min={1}
              step="1"
              value={feddans}
              onChange={(e) => setFeddans(Number(e.target.value))}
              required
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("الميزانية للفدان ($)", "Budget per feddan ($)")}
            <input
              type="number"
              name="budget_per_feddan"
              min={0}
              step="5"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              required
              className={field}
            />
          </label>
        </fieldset>

        {state && !state.ok && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !plan}
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {pending
            ? t("جارٍ الإنشاء...", "Creating...")
            : t("أنشئ الموسم بخطته", "Create the season and its plan")}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-6">
        {plan ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs text-muted">
              {t("الخطة التي ستُنشأ", "The plan that will be created")}
            </p>
            <p className="mt-1 text-sm">
              {t("زراعة", "Planting")}{" "}
              <span className="font-bold">{plan.plantingDate}</span> {arrow}{" "}
              {t("حصاد", "harvest")}{" "}
              <span className="font-bold">{plan.harvestDate}</span>
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">{t("إجمالي الماء", "Total water")}</p>
                <p className="text-lg font-black text-primary">
                  {n0(plan.totalWaterM3)}
                </p>
                <p className="text-xs text-muted">{t("م³", "m³")}</p>
              </div>
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">{t("الميزانية", "Budget")}</p>
                <p className="text-lg font-black">${n0(plan.totalBudget)}</p>
                <p className="text-xs text-muted">
                  {locale === "en"
                    ? `over ${plan.stages.length} stages`
                    : `على ${plan.stages.length} مراحل`}
                </p>
              </div>
            </div>

            <ol className="mt-4 flex flex-col gap-2">
              {plan.stages.map((s) => (
                <li key={s.key} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{stageName(s.key, locale)}</span>
                    <span className="text-muted">${n0(s.budget)}</span>
                  </div>
                  <p className="text-muted">
                    {s.startDate} {arrow} {s.endDate} · {s.days}{" "}
                    {t("يوماً", "days")}
                    {s.waterM3 > 0 ? ` · ${n0(s.waterM3)} ${t("م³", "m³")}` : ""}
                  </p>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              {t(
                "المراحل والمياه محسوبة بمعيار FAO-56 من محصولك ومنطقتك وتاريخ زراعتك — لا قوالب جاهزة.",
                "Stages and water are calculated with the FAO-56 method from your crop, your zone and your planting date — no ready-made templates.",
              )}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {t(
              "راجع المُدخلات — لا يمكن توليد خطة بهذه القيم.",
              "Check your inputs — a plan cannot be generated from these values.",
            )}
          </p>
        )}
      </aside>
    </div>
  );
}
