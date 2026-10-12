"use client";

import { useMemo, useState } from "react";
import {
  ALL_CROPS,
  CROPS,
  NEW_CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  waterRequirement,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { returnBand } from "@/lib/risk";
import { IRRIGATION_EN, MONTH_EN, cropName, stationName } from "@/lib/enNames";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function WaterCalculator() {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const months = locale === "en" ? MONTH_EN : MONTH_NAMES;
  const mm = t("ملم", "mm");
  const [cropKey, setCropKey] = useState("wheat");
  const [stationKey, setStationKey] = useState("gezira");
  const [plantingMonth, setPlantingMonth] = useState(10);
  const [method, setMethod] = useState<IrrigationMethod>("flood");
  const [feddans, setFeddans] = useState(10);

  const result = useMemo(() => {
    const crop = ALL_CROPS.find((c) => c.key === cropKey)!;
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
          {t("المحصول", "Crop")}
          <select
            value={cropKey}
            onChange={(e) => setCropKey(e.target.value)}
            className={select}
          >
            <optgroup label={t("محاصيل سودانية", "Sudanese crops")}>
              {CROPS.map((c) => (
                <option key={c.key} value={c.key}>
                  {cropName(c, locale)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("محاصيل جديدة تستحق التجربة", "New crops worth trying")}>
              {NEW_CROPS.map((c) => (
                <option key={c.key} value={c.key}>
                  {cropName(c, locale)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("المنطقة", "Region")}
          <select
            value={stationKey}
            onChange={(e) => setStationKey(e.target.value)}
            className={select}
          >
            {STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {stationName(s, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("شهر الزراعة", "Planting month")}
          <select
            value={plantingMonth}
            onChange={(e) => setPlantingMonth(Number(e.target.value))}
            className={select}
          >
            {months.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("طريقة الري", "Irrigation method")}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as IrrigationMethod)}
            className={select}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {locale === "en" ? IRRIGATION_EN[m] : IRRIGATION_LABEL[m]} (
                {Math.round(IRRIGATION_EFFICIENCY[m] * 100)}% {t("كفاءة", "efficiency")})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {t("المساحة (فدان)", "Area (feddan)")}
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
          <p className="text-xs text-muted">{t("احتياج الفدان للموسم كاملاً", "Need per feddan for the whole season")}</p>
          <p className="mt-1 text-2xl font-black text-primary">
            {n0(result.m3PerFeddan)} {t("م³", "m³")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {locale === "en"
              ? `${Math.round(result.totalGross)} mm over ${result.seasonDays} days`
              : `${Math.round(result.totalGross)} ملم على مدى ${result.seasonDays} يوماً`}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">
            {locale === "en" ? `Total for ${n0(area)} feddan` : `إجمالي ${n0(area)} فدان`}
          </p>
          <p className="mt-1 text-2xl font-black">
            {n0(result.m3PerFeddan * area)} {t("م³", "m³")}
          </p>
          <p className="mt-1 text-xs text-muted">{t("للموسم الواحد", "per season")}</p>
        </div>
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <p className="text-xs text-muted">
            {t("ذروة الطلب", "Peak demand")} — {months[result.peakMonthIndex]}
          </p>
          <p className="mt-1 text-2xl font-black text-accent">
            {peakLitresPerSecond.toFixed(1)} {t("لتر/ث", "L/s")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("بهذا يُحسب حجم المضخة لا بالمتوسط", "Size the pump on this, not on the average")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">{t("التوزيع الشهري", "Monthly breakdown")}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-start">
              <tr>
                <th className="px-4 py-3">{t("الشهر", "Month")}</th>
                <th className="px-4 py-3">{t("أيام", "Days")}</th>
                <th className="px-4 py-3">{t("حاجة المحصول", "Crop need")}</th>
                <th className="px-4 py-3">{t("مطر فعّال", "Effective rain")}</th>
                <th className="px-4 py-3">{t("صافي الري", "Net irrigation")}</th>
                <th className="px-4 py-3">{t("م³/فدان", "m³/feddan")}</th>
              </tr>
            </thead>
            <tbody>
              {result.monthly.map((m) => (
                <tr key={m.monthIndex} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    {months[m.monthIndex]}
                  </td>
                  <td className="px-4 py-2">{m.days}</td>
                  <td className="px-4 py-2">{Math.round(m.etc)} {mm}</td>
                  <td className="px-4 py-2">
                    {m.effectiveRain > 0.5
                      ? `${Math.round(m.effectiveRain)} ${mm}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {Math.round(m.netIrrigation)} {mm}
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
                  {t("الإجمالي", "Total")}
                </td>
                <td className="px-4 py-3">{Math.round(result.totalEtc)} {mm}</td>
                <td className="px-4 py-3">
                  {Math.round(result.totalEffectiveRain)} {mm}
                </td>
                <td className="px-4 py-3">{Math.round(result.totalNet)} {mm}</td>
                <td className="px-4 py-3">{n0(result.m3PerFeddan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {band && (
        <div>
          <h2 className="mb-3 text-lg font-bold">
            {t("العائد المتوقع للفدان — نطاق لا رقماً واحداً", "Expected return per feddan — a range, not a single number")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { l: t("سنة سيئة (١٠%)", "Bad year (10%)"), v: band.p10, tone: "text-danger" },
              { l: t("الوسيط (٥٠%)", "Median (50%)"), v: band.p50, tone: "text-primary" },
              { l: t("سنة جيدة (٩٠%)", "Good year (90%)"), v: band.p90, tone: "text-primary" },
            ].map((x) => (
              <div
                key={x.l}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <p className="text-xs text-muted">{x.l}</p>
                <p className={`mt-1 text-2xl font-black ${x.tone}`}>
                  {x.v >= 0 ? "" : "−"}${n0(Math.abs(x.v))}
                </p>
                <p className="mt-1 text-xs text-muted">{t("صافي ربح الفدان", "Net profit per feddan")}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {t("احتمال أن ينتهي الموسم بخسارة:", "Chance the season ends in a loss:")}{" "}
            <span className="font-bold text-foreground">
              {Math.round(band.lossProbability * 100)}%
            </span>
            {t(
              ". هذه أرقام استرشادية محسوبة من متوسطات إنتاجية وأسعار وتذبذبها التاريخي — وليست ضماناً.",
              ". These are indicative figures computed from average yields and prices and their historical swings — not a guarantee.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
