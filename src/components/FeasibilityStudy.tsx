"use client";

import { useMemo, useState } from "react";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  STATION_SOURCE_LABEL,
  type IrrigationMethod,
} from "@/lib/agronomy";
import {
  PRICE_BASIS_LABEL,
  PRICE_BASIS_NOTE,
  type CropMarket,
} from "@/lib/cropBenchmark";
import {
  phasedFeasibility,
  PHASE_VERDICT_LABEL,
  type PhaseVerdict,
} from "@/lib/feasibility";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const VERDICT_STYLE: Record<PhaseVerdict, string> = {
  within_national: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800",
  needs_peer: "border-amber-600/30 bg-amber-600/10 text-amber-900",
  beyond_peer: "border-rose-600/30 bg-rose-600/10 text-rose-800",
  unknown: "border-border bg-background text-muted",
};

export default function FeasibilityStudy({
  markets,
}: {
  markets: Record<string, CropMarket>;
}) {
  const [cropKey, setCropKey] = useState("sorghum");
  const [stationKey, setStationKey] = useState("gezira");
  const [plantingMonth, setPlantingMonth] = useState(5);
  const [method, setMethod] = useState<IrrigationMethod>("flood");
  const [feddans, setFeddans] = useState(50);
  const [costPerFeddan, setCostPerFeddan] = useState(120);
  const [waterTariff, setWaterTariff] = useState(0);
  const [manualPrice, setManualPrice] = useState("");

  const market = useMemo<CropMarket>(() => {
    const base = markets[cropKey] ?? {
      cropKey,
      faostatItem: null,
      sudanKgPerHa: null,
      nearestPeerKgPerHa: null,
      peerMedianKgPerHa: null,
      usdPerTonne: null,
      priceBasis: "none" as const,
      year: null,
    };
    const typed = Number(manualPrice);
    if (manualPrice.trim() !== "" && Number.isFinite(typed) && typed > 0) {
      return { ...base, usdPerTonne: typed, priceBasis: "manual" };
    }
    return base;
  }, [markets, cropKey, manualPrice]);

  const study = useMemo(() => {
    const crop = CROPS.find((c) => c.key === cropKey)!;
    const station = STATIONS.find((s) => s.key === stationKey)!;
    return phasedFeasibility({
      crop,
      station,
      plantingMonth,
      method,
      feddans: Number.isFinite(feddans) && feddans > 0 ? feddans : 1,
      costPerFeddan:
        Number.isFinite(costPerFeddan) && costPerFeddan >= 0 ? costPerFeddan : 0,
      usdPerCubicMetre:
        Number.isFinite(waterTariff) && waterTariff > 0 ? waterTariff : 0,
      market,
    });
  }, [
    cropKey,
    stationKey,
    plantingMonth,
    method,
    feddans,
    costPerFeddan,
    waterTariff,
    market,
  ]);

  const station = STATIONS.find((s) => s.key === stationKey)!;
  const field =
    "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

  if (!study) return null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          المحصول
          <select
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
          شهر الزراعة
          <select
            value={plantingMonth}
            onChange={(e) => setPlantingMonth(Number(e.target.value))}
            className={field}
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
            min={1}
            value={feddans}
            onChange={(e) => setFeddans(Number(e.target.value))}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          تكلفة العمليات للفدان ($)
          <input
            type="number"
            min={0}
            value={costPerFeddan}
            onChange={(e) => setCostPerFeddan(Number(e.target.value))}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          سعر المتر المكعب من الماء ($)
          <input
            type="number"
            min={0}
            step={0.001}
            value={waterTariff}
            onChange={(e) => setWaterTariff(Number(e.target.value))}
            className={field}
          />
          <span className="text-xs text-muted">
            صفر إن كان المصدر بئرك أو المطر
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          سعر الطن ($) — اختياري
          <input
            type="number"
            min={0}
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder={
              market.priceBasis === "none"
                ? "لا سعر في البيانات — أدخِله"
                : `الافتراضي ${n0(market.usdPerTonne ?? 0)}`
            }
            className={field}
          />
          <span className="text-xs text-muted">
            سعرك يعلو على أي تقدير
          </span>
        </label>
      </div>

      {/* ── Where the numbers came from ─────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">
          المرجعية التي تُقاس عليها
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">غلّة السودان</dt>
            <dd className="text-lg font-bold">
              {market.sudanKgPerHa === null
                ? "—"
                : `${n0(market.sudanKgPerHa)} كجم/هـ`}
            </dd>
            {market.year && (
              <dd className="text-xs text-muted">FAOSTAT {market.year}</dd>
            )}
          </div>
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">مصر — أقرب نظير مروي</dt>
            <dd className="text-lg font-bold">
              {market.nearestPeerKgPerHa === null
                ? "—"
                : `${n0(market.nearestPeerKgPerHa)} كجم/هـ`}
            </dd>
            <dd className="text-xs text-muted">
              وسيط النظراء{" "}
              {market.peerMedianKgPerHa === null
                ? "—"
                : n0(market.peerMedianKgPerHa)}
            </dd>
          </div>
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">السعر المعتمد</dt>
            <dd className="text-lg font-bold">
              {market.usdPerTonne === null
                ? "—"
                : `${n0(market.usdPerTonne)} $/طن`}
            </dd>
            <dd className="text-xs text-muted">
              {PRICE_BASIS_LABEL[market.priceBasis]}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {PRICE_BASIS_NOTE[market.priceBasis]}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          مناخ {station.name}: {STATION_SOURCE_LABEL[station.source]}. المقارنة
          بمصر ووسيط النظراء العرب والأفارقة والهند — لا بأعلى غلّة في العالم،
          فأعلاها بيوت زجاجية لا تُقاس عليها مزرعة مكشوفة.
        </p>
      </div>

      {/* ── The ladder ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            السلّم المرحلي — كم التزمتَ، وكم تحتاج لتستردّه
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            كل مرحلة تعرض ما أُنفق حتى نهايتها، ثم تُحوّله إلى الغلّة التي
            تُعيده عند الحصاد. القرار الحقيقي ليس «هل الموسم مجدٍ» بل «وقد أنفقتُ
            ما أنفقت، هل أدفع القسط التالي».
          </p>
        </div>

        <ol className="flex flex-col gap-2">
          {study.phases.map((p, i) => (
            <li
              key={p.stage}
              className={`rounded-xl border p-4 ${VERDICT_STYLE[p.verdict]}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {i + 1}. {p.name}
                </span>
                <span className="text-xs">
                  {PHASE_VERDICT_LABEL[p.verdict]}
                </span>
              </div>

              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-xs opacity-70">قسط المرحلة</span>
                  <div className="font-medium">{n0(p.cost)} $</div>
                </div>
                <div>
                  <span className="text-xs opacity-70">
                    الملتزم حتى هنا ({Math.round(p.cumulativeShare * 100)}٪)
                  </span>
                  <div className="font-medium">{n0(p.cumulativeCost)} $</div>
                </div>
                <div>
                  <span className="text-xs opacity-70">
                    غلّة التعادل عند هذه النقطة
                  </span>
                  <div className="font-bold">
                    {p.breakEvenKgPerHa === null
                      ? "—"
                      : `${n0(p.breakEvenKgPerHa)} كجم/هـ`}
                  </div>
                </div>
              </div>

              {p.lastSafeExit && (
                <p className="mt-2 rounded-lg bg-emerald-900/10 px-3 py-2 text-xs font-medium">
                  ← آخر مرحلة يُسترد ما فيها بالمتوسط الوطني. بعدها تراهن على
                  حصاد أعلى من المعتاد.
                </p>
              )}
            </li>
          ))}
        </ol>

        {study.lastSafeExit === null && (
          <p className="rounded-xl border border-rose-600/30 bg-rose-600/10 p-4 text-sm leading-relaxed text-rose-800">
            لا توجد مرحلة واحدة يُسترد ما فيها بالمتوسط الوطني — أي أن أول قسط
            يتجاوز ما يعيده هذا المحصول عادةً في السودان. راجع التكلفة أو
            المحصول أو السعر قبل التوقيع.
          </p>
        )}
      </div>

      {/* ── Season totals ───────────────────────────────────────── */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">التكلفة</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">عمليات حقلية</dt>
              <dd>{n0(study.fieldCost)} $</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                ماء ({n0(study.waterM3Total)} م³)
              </dt>
              <dd>{n0(study.waterCost)} $</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-bold">
              <dt>الإجمالي</dt>
              <dd>{n0(study.totalCost)} $</dd>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <dt>للفدان</dt>
              <dd>{n0(study.costPerFeddan)} $</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">العائد والهامش</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">بالمتوسط الوطني</dt>
              <dd>
                {study.revenueAtNational === null
                  ? "—"
                  : `${n0(study.revenueAtNational)} $`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">الهامش</dt>
              <dd
                className={
                  study.marginAtNational !== null && study.marginAtNational < 0
                    ? "font-bold text-danger"
                    : "font-bold"
                }
              >
                {study.marginAtNational === null
                  ? "—"
                  : `${n0(study.marginAtNational)} $`}
              </dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-1">
              <dt className="text-muted">لو بلغتَ غلّة مصر</dt>
              <dd>
                {study.revenueAtPeer === null
                  ? "—"
                  : `${n0(study.revenueAtPeer)} $`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">الهامش عندها</dt>
              <dd className="font-bold">
                {study.marginAtPeer === null
                  ? "—"
                  : `${n0(study.marginAtPeer)} $`}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        الماء موزَّع على المراحل بنفس نسب الميزانية — وهو تقريبٌ نقوله صراحةً:
        FAO-56 يقسم الموسم أربع مراحل وتقويم المنصّة سبعاً، فلا خريطة أمينة
        بينهما. التقريب يُقلّل ماء منتصف الموسم حيث يشرب المحصول أكثره، ويتطابق
        تماماً عند الحصاد — وهو الرقم الذي تدور عليه الدراسة.
      </p>
    </div>
  );
}
