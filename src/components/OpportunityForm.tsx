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
  WATER_SOURCE_LABEL_EN,
  type WaterSource,
} from "@/lib/risk";
import {
  submitOpportunity,
  type SubmitResult,
} from "@/app/opportunities/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import type { OfferableLand } from "@/lib/landOpportunity";

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

const DOCUMENTS_EN = [
  "Proof of land ownership or a valid tenure contract",
  "Photos of the land with GPS coordinates",
  "A permit or approval from the relevant agricultural authority",
  "A documented field inspection by a field agent",
];

const CROP_EN: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize",
  cotton: "Cotton",
  groundnut: "Groundnut",
  sesame: "Sesame",
  alfalfa: "Alfalfa",
  onion: "Onion",
  tomato: "Tomato",
  sugarcane: "Sugarcane",
  millet: "Millet",
  dates: "Date palm",
};

const STATION_EN: Record<string, string> = {
  khartoum: "Khartoum",
  gezira: "Gezira (Wad Madani)",
  rivernile: "River Nile (Atbara)",
  northern: "Northern (Dongola)",
  kordofan: "North Kordofan (El Obeid)",
  kassala: "Kassala",
  nyala: "South Darfur (Nyala)",
  elfasher: "North Darfur (El Fasher)",
  damazin: "Blue Nile (Ed Damazin)",
  kosti: "White Nile (Kosti)",
  geneina: "West Darfur (El Geneina)",
  zalingei: "Central Darfur (Zalingei)",
  eddaein: "East Darfur (Ed Daein)",
  kurmuk: "Blue Nile (Kurmuk)",
  sennar: "Sennar",
};

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const IRRIGATION_EN: Record<IrrigationMethod, string> = {
  flood: "Flood irrigation",
  sprinkler: "Sprinkler irrigation",
  pivot: "Centre pivot",
  drip: "Drip irrigation",
};


export default function OpportunityForm({
  operatorSeasons,
  operatorReportingRate,
  fromLand = null,
}: {
  operatorSeasons: number;
  operatorReportingRate: number;
  /** A verified land the opportunity starts from (backlog 123). */
  fromLand?: OfferableLand | null;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitResult | null,
    FormData
  >(submitOpportunity, null);
  const locale = useLocale();
  const en = locale === "en";
  const t = (ar: string, english: string) => tr(locale, ar, english);
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const [cropKey, setCropKey] = useState("wheat");
  const [stationKey, setStationKey] = useState(fromLand?.stationKey ?? "gezira");
  const [plantingMonth, setPlantingMonth] = useState(10);
  const [irrigation, setIrrigation] = useState<IrrigationMethod>("flood");
  const [waterSource, setWaterSource] = useState<WaterSource>(fromLand?.waterSource ?? "canal");
  const [water, setWater] = useState(fromLand?.waterPerFeddan ?? 3600);
  const [kmToMarket, setKmToMarket] = useState(fromLand?.kmToMarket ?? 15);
  // A document already on the verified land is a file the administration has
  // seen, not a tick — it starts checked and cannot be unticked here.
  const onLand = fromLand?.docs ?? [false, false, false, false];
  const [docs, setDocs] = useState<boolean[]>(onLand);

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
      }, locale),
    [
      locale,
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
        <h2 className="mb-2 text-lg font-bold text-primary">{t("تم الرفع", "Submitted")}</h2>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="flex flex-col gap-5">
        {fromLand && (
          <div className="rounded-2xl bg-primary/5 p-4 text-sm ring-1 ring-primary/20">
            <input type="hidden" name="land_id" value={fromLand.id} />
            <p className="font-bold text-primary">
              {t("على أرضك الموثّقة:", "On your verified land:")}{" "}
              <span {...arText}>{fromLand.name}</span>
            </p>
            <p className="mt-1 text-xs leading-6 text-muted">
              {t(
                "ملأنا الاسم والموقع والمساحة والمنطقة والمياه والمستندات من بيانات أرضك. اختر المحصول وشهر الزراعة وطريقة الري والحصص، وغيّر ما تريد.",
                "The name, location, area, zone, water and documents are filled in from your land. Choose the crop, planting month, irrigation and shares, and change what you like.",
              )}
            </p>
          </div>
        )}

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">{t("التعريف", "Basics")}</legend>

          <label className="flex flex-col gap-1 text-sm">
            {t("اسم الفرصة", "Opportunity name")}
            <input
              name="name"
              required
              defaultValue={fromLand?.name}
              className={field}
              placeholder={t("مثال: زراعة قمح — ٢٠٠ فدان", "e.g. Wheat farming — 200 feddans")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("الموقع", "Location")}
            <input
              name="location"
              required
              defaultValue={fromLand?.location}
              className={field}
              placeholder={t("الولاية والمحلية والقرية", "State, locality and village")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("وصف مختصر", "Short description")}
            <textarea name="description" rows={3} className={field} />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">{t("الزراعة والمياه", "Crop and water")}</legend>

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
                  {en ? (CROP_EN[c.key] ?? c.name) : c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("المنطقة", "Area")}
            <select
              name="station_key"
              value={stationKey}
              onChange={(e) => setStationKey(e.target.value)}
              className={field}
            >
              {STATIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {en ? (STATION_EN[s.key] ?? s.name) : s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("شهر الزراعة", "Planting month")}
            <select
              name="planting_month"
              value={plantingMonth}
              onChange={(e) => setPlantingMonth(Number(e.target.value))}
              className={field}
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i}>
                  {en ? MONTHS_EN[i] : m}
                </option>
              ))}
            </select>
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
                  {en ? IRRIGATION_EN[m] : IRRIGATION_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("مصدر المياه", "Water source")}
            <select
              name="water_source"
              value={waterSource}
              onChange={(e) => setWaterSource(e.target.value as WaterSource)}
              className={field}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {en ? WATER_SOURCE_LABEL_EN[s] : WATER_SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("المياه المتاحة (م³ للفدان في الموسم)", "Water available (m³ per feddan per season)")}
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
          <legend className="px-2 text-sm font-bold">{t("الحجم والحصص", "Size and shares")}</legend>

          <label className="flex flex-col gap-1 text-sm">
            {t("المساحة (فدان)", "Area (feddans)")}
            <input
              type="number"
              name="total_feddans"
              min={1}
              defaultValue={fromLand?.feddans ?? 100}
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("سعر الحصة ($)", "Share price ($)")}
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
            {t("عدد الحصص", "Number of shares")}
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
            {t("المسافة لأقرب طريق سوق (كم)", "Distance to the nearest market road (km)")}
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
          <legend className="px-2 text-sm font-bold">{t("التوثيق المطلوب", "Required documents")}</legend>
          <p className="text-sm text-muted">
            {t(
              "الأربعة كلها إلزامية. المنصة لا تنشر فرصة بتوثيق ناقص — هذا شرط في قاعدة البيانات نفسها لا مجرد سياسة.",
              "All four are required. The platform does not publish an opportunity with incomplete documents — this is a rule in the database itself, not just a policy.",
            )}
          </p>
          {DOCUMENTS.map((d, i) => (
            <label key={d} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={docs[i]}
                disabled={onLand[i]}
                onChange={(e) => {
                  const next = [...docs];
                  next[i] = e.target.checked;
                  setDocs(next);
                }}
                className="mt-1"
              />
              <span>
                {en ? DOCUMENTS_EN[i] : d}
                {onLand[i] && (
                  <span className="ms-1 text-xs font-bold text-primary">
                    {t("— مرفوعٌ على أرضك", "— on file with your land")}
                  </span>
                )}
              </span>
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
              <ul className="mt-2 list-disc space-y-1 ps-5" {...arText}>
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
          {pending ? t("جارٍ الرفع...", "Submitting...") : t("ارفع الفرصة للمراجعة", "Submit the opportunity for review")}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">{t("درجة التقييم الآن", "Current score")}</p>
          <p className={`mt-1 text-4xl font-black ${scoreTone}`}>
            {assessment.score}
            <span className="text-lg text-muted">/100</span>
          </p>

          <div className="mt-4 flex flex-col gap-3" {...arText}>
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
            <p className="mb-2 font-bold">{t("يمنع الرفع حالياً:", "Currently blocking submission:")}</p>
            <ul className="list-disc space-y-1 ps-5" {...arText}>
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
