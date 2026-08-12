"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { planSeason } from "@/lib/season";
import { createSeason, type ActionResult } from "@/app/seasons/actions";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function SeasonForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createSeason, null);

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
          <legend className="px-2 text-sm font-bold">الموسم</legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            اسم الموسم
            <input
              name="name"
              required
              className={field}
              placeholder="مثال: قمح شتوي ٢٠٢٦ — حقل الشمال"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            الموقع
            <input
              name="location"
              className={field}
              placeholder="القرية والمحلية"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المحصول
            <select
              name="crop_key"
              value={cropKey}
              onChange={(e) => setCropKey(e.target.value)}
              className={field}
            >
              {CROPS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المنطقة
            <select
              name="station_key"
              value={stationKey}
              onChange={(e) => setStationKey(e.target.value)}
              className={field}
            >
              {STATIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            تاريخ الزراعة
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
            طريقة الري
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
                  {IRRIGATION_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المساحة (فدان)
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
            الميزانية للفدان ($)
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
          {pending ? "جارٍ الإنشاء..." : "أنشئ الموسم بخطته"}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-6">
        {plan ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs text-muted">الخطة التي ستُنشأ</p>
            <p className="mt-1 text-sm">
              زراعة <span className="font-bold">{plan.plantingDate}</span> ←
              حصاد <span className="font-bold">{plan.harvestDate}</span>
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">إجمالي الماء</p>
                <p className="text-lg font-black text-primary">
                  {n0(plan.totalWaterM3)}
                </p>
                <p className="text-xs text-muted">م³</p>
              </div>
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">الميزانية</p>
                <p className="text-lg font-black">${n0(plan.totalBudget)}</p>
                <p className="text-xs text-muted">
                  على {plan.stages.length} مراحل
                </p>
              </div>
            </div>

            <ol className="mt-4 flex flex-col gap-2">
              {plan.stages.map((s) => (
                <li key={s.key} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted">${n0(s.budget)}</span>
                  </div>
                  <p className="text-muted">
                    {s.startDate} ← {s.endDate} · {s.days} يوماً
                    {s.waterM3 > 0 ? ` · ${n0(s.waterM3)} م³` : ""}
                  </p>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              المراحل والمياه محسوبة بمعيار FAO-56 من محصولك ومنطقتك وتاريخ
              زراعتك — لا قوالب جاهزة.
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            راجع المُدخلات — لا يمكن توليد خطة بهذه القيم.
          </p>
        )}
      </aside>
    </div>
  );
}
