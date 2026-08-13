"use client";

import { useActionState, useMemo, useState } from "react";
import {
  STATIONS,
  CROPS,
  waterRequirement,
} from "@/lib/agronomy";
import type { IrrigationMethod } from "@/lib/agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import { registerLand, type LandResult } from "@/app/lands/actions";

const SOURCES = Object.keys(WATER_SOURCE_LABEL) as WaterSource[];
const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const TENURES: [string, string][] = [
  ["owned", "ملك"],
  ["leased", "إيجار أو حكر"],
  ["communal", "أرض مشاع أو قبلية"],
  ["unspecified", "غير محدّد"],
];

export default function LandForm() {
  const [state, formAction, pending] = useActionState<
    LandResult | null,
    FormData
  >(registerLand, null);

  const [stationKey, setStationKey] = useState("gezira");
  const [feddans, setFeddans] = useState(20);
  const [waterPerFeddan, setWaterPerFeddan] = useState(3600);

  /**
   * What the declared water actually supports. A farmer describing a plot
   * usually knows how much water reaches it but not what that buys, so the
   * FAO-56 engine answers it here rather than after a season is wasted.
   */
  const capacity = useMemo(() => {
    const station = STATIONS.find((s) => s.key === stationKey);
    if (!station || !(waterPerFeddan > 0)) return [];

    return CROPS.slice(0, 6)
      .map((crop) => {
        const flood = waterRequirement(
          crop,
          station,
          10,
          "flood" as IrrigationMethod,
        );
        const drip = waterRequirement(
          crop,
          station,
          10,
          "drip" as IrrigationMethod,
        );
        return {
          name: crop.name,
          flood: flood.m3PerFeddan,
          drip: drip.m3PerFeddan,
          okFlood: waterPerFeddan >= flood.m3PerFeddan,
          okDrip: waterPerFeddan >= drip.m3PerFeddan,
        };
      })
      .sort((a, b) => a.drip - b.drip);
  }, [stationKey, waterPerFeddan]);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6">
        <h2 className="mb-2 text-lg font-bold text-primary">سُجّلت الأرض</h2>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="flex flex-col gap-5">
        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">التعريف والموقع</legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            اسم الأرض
            <input
              name="name"
              required
              className={field}
              placeholder="مثال: حقل الشمال"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            الولاية
            <input name="state" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            المحلية
            <input name="locality" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            القرية
            <input name="village" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            نوع الحيازة
            <select name="tenure" className={field} defaultValue="owned">
              {TENURES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            خط العرض (اختياري)
            <input
              type="number"
              step="any"
              name="latitude"
              className={field}
              placeholder="15.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            خط الطول (اختياري)
            <input
              type="number"
              step="any"
              name="longitude"
              className={field}
              placeholder="32.1"
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">الأرض والمياه</legend>

          <label className="flex flex-col gap-1 text-sm">
            المساحة (فدان)
            <input
              type="number"
              name="feddans"
              min={1}
              step="0.5"
              required
              value={feddans}
              onChange={(e) => setFeddans(Number(e.target.value))}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المنطقة المناخية
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
            مصدر المياه
            <select name="water_source" className={field} defaultValue="canal">
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {WATER_SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المياه المتاحة (م³ للفدان في الموسم)
            <input
              type="number"
              name="water_per_feddan"
              min={0}
              step="50"
              value={waterPerFeddan}
              onChange={(e) => setWaterPerFeddan(Number(e.target.value))}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            المسافة لأقرب سوق (كم)
            <input
              type="number"
              name="km_to_market"
              min={0}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            وصف التربة
            <input
              name="soil_note"
              className={field}
              placeholder="طينية ثقيلة، رملية..."
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            ما زُرع فيها سابقاً
            <input
              name="previous_crops"
              className={field}
              placeholder="قمح ٢٠٢٥، ذرة ٢٠٢٤..."
            />
          </label>
        </fieldset>

        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm text-accent">
          <p className="font-bold">التوثيق المطلوب قبل النشر</p>
          <p className="mt-2 leading-relaxed">
            سُجّل أرضك الآن بلا مستندات — لن تظهر لأحد. وقبل نشرها للمستثمرين
            سنطلب ثلاثة: إثبات الحيازة أو عقد الإيجار، وصوراً للأرض بإحداثيات،
            ومعاينة ميدانية من مندوب. هذا ما يجعل عرضك قابلاً للتصديق.
          </p>
        </div>

        {state && !state.ok && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "جارٍ التسجيل..." : "سجّل الأرض"}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">ماذا تكفي مياهك؟</p>
          <p className="mt-1 text-sm text-muted">
            بـ {n0(waterPerFeddan)} م³ للفدان، وعلى {n0(feddans)} فدان (
            {n0(waterPerFeddan * feddans)} م³ للموسم):
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {capacity.map((c) => (
              <li key={c.name} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={
                      c.okFlood
                        ? "text-primary"
                        : c.okDrip
                          ? "text-accent"
                          : "text-danger"
                    }
                  >
                    {c.okFlood
                      ? "يكفي بالغمر"
                      : c.okDrip
                        ? "بالتنقيط فقط"
                        : "لا يكفي"}
                  </span>
                </div>
                <p className="text-muted">
                  غمر {n0(c.flood)} · تنقيط {n0(c.drip)} م³/فدان
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            محسوب بمعيار FAO-56 لزراعة نوفمبر في منطقتك. «بالتنقيط فقط» تعني أن
            مياهك تكفي المحصول إن رفعت كفاءة الري لا إن رويت بالغمر.
          </p>
        </div>
      </aside>
    </div>
  );
}
