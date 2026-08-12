"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  type IrrigationMethod,
} from "@/lib/agronomy";
import {
  assessProject,
  WATER_SOURCE_LABEL,
  type WaterSource,
} from "@/lib/risk";
import {
  submitOpportunity,
  type SubmitResult,
} from "@/app/opportunities/actions";

const METHODS = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
const SOURCES = Object.keys(WATER_SOURCE_LABEL) as WaterSource[];

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

const DOCUMENTS = [
  "إثبات ملكية الأرض أو عقد حيازة ساري",
  "صور للأرض بإحداثيات جغرافية",
  "تصريح أو موافقة الجهة الزراعية المختصة",
  "معاينة ميدانية موثّقة من مندوب",
];

export default function OpportunityForm({
  operatorSeasons,
  operatorReportingRate,
}: {
  operatorSeasons: number;
  operatorReportingRate: number;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitResult | null,
    FormData
  >(submitOpportunity, null);

  const [cropKey, setCropKey] = useState("wheat");
  const [stationKey, setStationKey] = useState("gezira");
  const [plantingMonth, setPlantingMonth] = useState(10);
  const [irrigation, setIrrigation] = useState<IrrigationMethod>("flood");
  const [waterSource, setWaterSource] = useState<WaterSource>("canal");
  const [water, setWater] = useState(3600);
  const [kmToMarket, setKmToMarket] = useState(15);
  const [docs, setDocs] = useState<boolean[]>([false, false, false, false]);

  const documentsOnFile = docs.filter(Boolean).length;

  // Live preview only. The stored score is recomputed on the server.
  const assessment = useMemo(
    () =>
      assessProject({
        cropKey,
        stationKey,
        plantingMonth,
        irrigation,
        waterSource,
        declaredWaterPerFeddan: water,
        documentsOnFile,
        documentsRequired: 4,
        operatorSeasons,
        operatorReportingRate,
        kmToMarket,
      }),
    [
      cropKey,
      stationKey,
      plantingMonth,
      irrigation,
      waterSource,
      water,
      documentsOnFile,
      kmToMarket,
      operatorSeasons,
      operatorReportingRate,
    ],
  );

  const scoreTone =
    assessment.score >= 75
      ? "text-primary"
      : assessment.score >= 55
        ? "text-accent"
        : "text-danger";

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6">
        <h2 className="mb-2 text-lg font-bold text-primary">تم الرفع</h2>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">التعريف</legend>

          <label className="flex flex-col gap-1 text-sm">
            اسم الفرصة
            <input
              name="name"
              required
              className={field}
              placeholder="مثال: زراعة قمح — ٢٠٠ فدان"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            الموقع
            <input
              name="location"
              required
              className={field}
              placeholder="الولاية والمحلية والقرية"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            وصف مختصر
            <textarea name="description" rows={3} className={field} />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">الزراعة والمياه</legend>

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
            شهر الزراعة
            <select
              name="planting_month"
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
            مصدر المياه
            <select
              name="water_source"
              value={waterSource}
              onChange={(e) => setWaterSource(e.target.value as WaterSource)}
              className={field}
            >
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
              name="declared_water_per_feddan"
              min={0}
              step="50"
              value={water}
              onChange={(e) => setWater(Number(e.target.value))}
              required
              className={field}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
          <legend className="px-2 text-sm font-bold">الحجم والحصص</legend>

          <label className="flex flex-col gap-1 text-sm">
            المساحة (فدان)
            <input
              type="number"
              name="total_feddans"
              min={1}
              defaultValue={100}
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            سعر الحصة ($)
            <input
              type="number"
              name="price_per_share"
              min={1}
              defaultValue={50}
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            عدد الحصص
            <input
              type="number"
              name="total_shares"
              min={1}
              defaultValue={1000}
              required
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            المسافة لأقرب طريق سوق (كم)
            <input
              type="number"
              name="km_to_market"
              min={0}
              value={kmToMarket}
              onChange={(e) => setKmToMarket(Number(e.target.value))}
              required
              className={field}
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">التوثيق المطلوب</legend>
          <p className="text-sm text-muted">
            الأربعة كلها إلزامية. المنصة لا تنشر فرصة بتوثيق ناقص — هذا شرط في
            قاعدة البيانات نفسها لا مجرد سياسة.
          </p>
          {DOCUMENTS.map((d, i) => (
            <label key={d} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={docs[i]}
                onChange={(e) => {
                  const next = [...docs];
                  next[i] = e.target.checked;
                  setDocs(next);
                }}
                className="mt-1"
              />
              {d}
            </label>
          ))}
          <input
            type="hidden"
            name="documents_on_file"
            value={documentsOnFile}
          />
        </fieldset>

        {state && !state.ok && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-bold">{state.message}</p>
            {state.blockers && (
              <ul className="mt-2 list-disc space-y-1 pr-5">
                {state.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || assessment.blockers.length > 0}
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "جارٍ الرفع..." : "ارفع الفرصة للمراجعة"}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">درجة التقييم الآن</p>
          <p className={`mt-1 text-4xl font-black ${scoreTone}`}>
            {assessment.score}
            <span className="text-lg text-muted">/100</span>
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {assessment.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted">
                    {Math.round(f.score * f.weight)}/{f.weight}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.round(f.score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {f.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {assessment.blockers.length > 0 && (
          <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <p className="mb-2 font-bold">يمنع الرفع حالياً:</p>
            <ul className="list-disc space-y-1 pr-5">
              {assessment.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
