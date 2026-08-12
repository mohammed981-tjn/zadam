"use client";

import { useMemo, useState } from "react";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  waterRequirement,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { returnBand } from "@/lib/risk";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function WaterCalculator() {
  const [cropKey, setCropKey] = useState("wheat");
  const [stationKey, setStationKey] = useState("gezira");
  const [plantingMonth, setPlantingMonth] = useState(10);
  const [method, setMethod] = useState<IrrigationMethod>("flood");
  const [feddans, setFeddans] = useState(10);

  const result = useMemo(() => {
    const crop = CROPS.find((c) => c.key === cropKey)!;
    const station = STATIONS.find((s) => s.key === stationKey)!;
    return waterRequirement(crop, station, plantingMonth, method);
  }, [cropKey, stationKey, plantingMonth, method]);

  const band = useMemo(() => returnBand(cropKey), [cropKey]);

  const area = Number.isFinite(feddans) && feddans > 0 ? feddans : 1;
  const peakLitresPerSecond =
    (result.peakM3PerFeddanPerDay * area * 1000) / 86400;

  const select =
    "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          المحصول
          <select
            value={cropKey}
            onChange={(e) => setCropKey(e.target.value)}
            className={select}
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
            value={stationKey}
            onChange={(e) => setStationKey(e.target.value)}
            className={select}
          >
            {STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          شهر الزراعة
          <select
            value={plantingMonth}
            onChange={(e) => setPlantingMonth(Number(e.target.value))}
            className={select}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          طريقة الري
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as IrrigationMethod)}
            className={select}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {IRRIGATION_LABEL[m]} (
                {Math.round(IRRIGATION_EFFICIENCY[m] * 100)}% كفاءة)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          المساحة (فدان)
          <input
            type="number"
            min={1}
            step="1"
            value={feddans}
            onChange={(e) => setFeddans(Number(e.target.value))}
            className={select}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xs text-muted">احتياج الفدان للموسم كاملاً</p>
          <p className="mt-1 text-2xl font-black text-primary">
            {n0(result.m3PerFeddan)} م³
          </p>
          <p className="mt-1 text-xs text-muted">
            {Math.round(result.totalGross)} ملم على مدى {result.seasonDays}{" "}
            يوماً
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">إجمالي {n0(area)} فدان</p>
          <p className="mt-1 text-2xl font-black">
            {n0(result.m3PerFeddan * area)} م³
          </p>
          <p className="mt-1 text-xs text-muted">للموسم الواحد</p>
        </div>
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <p className="text-xs text-muted">
            ذروة الطلب — {MONTH_NAMES[result.peakMonthIndex]}
          </p>
          <p className="mt-1 text-2xl font-black text-accent">
            {peakLitresPerSecond.toFixed(1)} لتر/ث
          </p>
          <p className="mt-1 text-xs text-muted">
            بهذا يُحسب حجم المضخة لا بالمتوسط
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">التوزيع الشهري</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-right">
              <tr>
                <th className="px-4 py-3">الشهر</th>
                <th className="px-4 py-3">أيام</th>
                <th className="px-4 py-3">حاجة المحصول</th>
                <th className="px-4 py-3">مطر فعّال</th>
                <th className="px-4 py-3">صافي الري</th>
                <th className="px-4 py-3">م³/فدان</th>
              </tr>
            </thead>
            <tbody>
              {result.monthly.map((m) => (
                <tr key={m.monthIndex} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    {MONTH_NAMES[m.monthIndex]}
                  </td>
                  <td className="px-4 py-2">{m.days}</td>
                  <td className="px-4 py-2">{Math.round(m.etc)} ملم</td>
                  <td className="px-4 py-2">
                    {m.effectiveRain > 0.5
                      ? `${Math.round(m.effectiveRain)} ملم`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {Math.round(m.netIrrigation)} ملم
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {n0(m.grossIrrigation * 4.2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-card font-bold">
                <td className="px-4 py-3" colSpan={2}>
                  الإجمالي
                </td>
                <td className="px-4 py-3">{Math.round(result.totalEtc)} ملم</td>
                <td className="px-4 py-3">
                  {Math.round(result.totalEffectiveRain)} ملم
                </td>
                <td className="px-4 py-3">{Math.round(result.totalNet)} ملم</td>
                <td className="px-4 py-3">{n0(result.m3PerFeddan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {band && (
        <div>
          <h2 className="mb-3 text-lg font-bold">
            العائد المتوقع للفدان — نطاق لا رقماً واحداً
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { l: "سنة سيئة (١٠%)", v: band.p10, tone: "text-danger" },
              { l: "الوسيط (٥٠%)", v: band.p50, tone: "text-primary" },
              { l: "سنة جيدة (٩٠%)", v: band.p90, tone: "text-primary" },
            ].map((x) => (
              <div
                key={x.l}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <p className="text-xs text-muted">{x.l}</p>
                <p className={`mt-1 text-2xl font-black ${x.tone}`}>
                  {x.v >= 0 ? "" : "−"}${n0(Math.abs(x.v))}
                </p>
                <p className="mt-1 text-xs text-muted">صافي ربح الفدان</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            احتمال أن ينتهي الموسم بخسارة:{" "}
            <span className="font-bold text-foreground">
              {Math.round(band.lossProbability * 100)}%
            </span>
            . هذه أرقام استرشادية محسوبة من متوسطات إنتاجية وأسعار وتذبذبها
            التاريخي — وليست ضماناً.
          </p>
        </div>
      )}
    </div>
  );
}
