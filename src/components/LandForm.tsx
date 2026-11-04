"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useOutboxAction } from "@/lib/useOutboxAction";
import {
  STATIONS,
  CROPS,
  waterRequirement,
} from "@/lib/agronomy";
import type { IrrigationMethod } from "@/lib/agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import { registerLand, type LandResult } from "@/app/lands/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { cropName, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";

const SOURCES = Object.keys(WATER_SOURCE_LABEL) as WaterSource[];

/** The live map, fetched only when the farmer opens it (البند ١٤٧). */
const LiveMap = dynamic(() => import("@/components/map/LiveMap"), { ssr: false });
const deg = (v: number) => String(Math.round(v * 1e5) / 1e5);
const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const TENURES: [string, string, string][] = [
  ["owned", "ملك", "Owned"],
  ["leased", "إيجار أو حكر", "Leased or long-term lease (hikr)"],
  ["communal", "أرض مشاع أو قبلية", "Communal or tribal land"],
  ["unspecified", "غير محدّد", "Not specified"],
];

/** `forFarmer`: an agent registering in the name of a farmer who authorised it (backlog 169). */
export default function LandForm({ forFarmer }: { forFarmer?: string } = {}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { state, formAction, pending, note, kept } = useOutboxAction<LandResult>(registerLand, {
    key: forFarmer ? `land-new-${forFarmer}` : "land-new",
    label: t("تسجيل أرض", "Registering a land"),
  });

  const [stationKey, setStationKey] = useState("gezira");
  const [feddans, setFeddans] = useState(20);
  // MAP-4 (backlog 162): no number is put in the owner's mouth. Empty means «I do not know», and
  // an investor is shown what the owner typed, as the owner's own declaration, or nothing.
  const [waterText, setWaterText] = useState("");
  const waterPerFeddan = Number(waterText);
  // The place: typed, or tapped on the map, or «موقعي» on the map.
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [picking, setPicking] = useState(false);
  const at: [number, number] | null =
    lat !== "" && lon !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      ? [Number(lon), Number(lat)]
      : null;

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
          name: cropName(crop.key, locale),
          flood: flood.m3PerFeddan,
          drip: drip.m3PerFeddan,
          okFlood: waterPerFeddan >= flood.m3PerFeddan,
          okDrip: waterPerFeddan >= drip.m3PerFeddan,
        };
      })
      .sort((a, b) => a.drip - b.drip);
  }, [stationKey, waterPerFeddan, locale]);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6">
        <h2 className="mb-2 text-lg font-bold text-primary">
          {t("سُجّلت الأرض", "Land registered")}
        </h2>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="flex flex-col gap-5">
        {forFarmer && <input type="hidden" name="for_farmer" value={forFarmer} />}
        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">
            {t("التعريف والموقع", "Identity and location")}
          </legend>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("اسم الأرض", "Land name")}
            <input
              name="name"
              required
              className={field}
              placeholder={t("مثال: حقل الشمال", "e.g. North field")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("الولاية", "State")}
            <input name="state" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("المحلية", "Locality")}
            <input name="locality" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("القرية", "Village")}
            <input name="village" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("نوع الحيازة", "Tenure type")}
            <select name="tenure" className={field} defaultValue="owned">
              {TENURES.map(([v, ar, en]) => (
                <option key={v} value={v}>
                  {t(ar, en)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("خط العرض (اختياري)", "Latitude (optional)")}
            <input
              type="number"
              step="any"
              name="latitude"
              className={field}
              placeholder="15.5"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("خط الطول (اختياري)", "Longitude (optional)")}
            <input
              type="number"
              step="any"
              name="longitude"
              className={field}
              placeholder="32.1"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </label>

          {/*
            No one knows their field's latitude by heart; everyone can find it
            on a satellite image. The map opens on the satellite, and a tap or
            «موقعي» writes the two numbers above.
          */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-expanded={picking}
              className="self-start rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10"
            >
              📍 {picking ? t("أخفِ الخريطة", "Hide the map") : t("حدّد موقع الأرض على الخريطة", "Find the land on the map")}
            </button>
            {picking && (
              <>
                <p className="text-xs leading-6 text-muted">
                  {t(
                    "المس أرضك على صورة القمر الصناعيّ، أو اضغط «موقعي» وأنت فيها، فيُكتب الموقع في الخانتين. موقع الأرض في صفحتها، لمن يأذن له صاحبها.",
                    "Tap your land on the satellite image, or press «My location» while you are on it, and the place is written into the two boxes. A land's place is on its own page, for whom its owner allows.",
                  )}
                </p>
                <LiveMap
                  className="h-80"
                  initialGround="sat"
                  {...(at ? { center: at, zoom: 13 } : {})}
                  marker={at}
                  onPick={([x, y]) => {
                    setLon(deg(x));
                    setLat(deg(y));
                  }}
                />
              </>
            )}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">
            {t("الأرض والمياه", "Land and water")}
          </legend>

          <label className="flex flex-col gap-1 text-sm">
            {t("المساحة (فدان)", "Area (feddans)")}
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
            {t("المنطقة المناخية", "Climate zone")}
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
            {t("مصدر المياه", "Water source")}
            <select name="water_source" className={field} defaultValue="canal">
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {waterSourceLabel(s, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t(
              "المياه المتاحة (م³ للفدان في الموسم)",
              "Available water (m³ per feddan per season)",
            )}
            <input
              type="number"
              name="water_per_feddan"
              min={0}
              step="50"
              value={waterText}
              onChange={(e) => setWaterText(e.target.value)}
              placeholder={t("مثلاً 3600 — أو اتركه فارغاً", "e.g. 3600 — or leave it empty")}
              className={field}
            />
            <span className="text-xs text-muted">
              {t(
                "اتركه فارغاً إن لم تعرف. وما تكتبه يراه المستثمر على أنّه من إعلانك أنت.",
                "Leave it empty if you do not know. What you type is shown to investors as your own declaration.",
              )}
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("المسافة لأقرب سوق (كم)", "Distance to the nearest market (km)")}
            <input
              type="number"
              name="km_to_market"
              min={0}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("وصف التربة", "Soil description")}
            <input
              name="soil_note"
              className={field}
              placeholder={t("طينية ثقيلة، رملية...", "Heavy clay, sandy...")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("ما زُرع فيها سابقاً", "What was grown here before")}
            <input
              name="previous_crops"
              className={field}
              placeholder={t("قمح ٢٠٢٥، ذرة ٢٠٢٤...", "Wheat 2025, sorghum 2024...")}
            />
          </label>
        </fieldset>

        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm text-accent">
          <p className="font-bold">
            {t("التوثيق المطلوب قبل النشر", "Documents required before publishing")}
          </p>
          <p className="mt-2 leading-relaxed">
            {t(
              "سُجّل أرضك الآن بلا مستندات — لن تظهر لأحد. وقبل نشرها للمستثمرين سنطلب ثلاثة: إثبات الحيازة أو عقد الإيجار، وصوراً للأرض بإحداثيات، ومعاينة ميدانية من مندوب. هذا ما يجعل عرضك قابلاً للتصديق.",
              "Register your land now without documents — no one will see it. Before it is published to investors we will ask for three things: proof of tenure or a lease, photos of the land with coordinates, and a field inspection by a representative. That is what makes your offer credible.",
            )}
          </p>
        </div>

        {state && !state.ok && (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              kept ? "border-primary/30 bg-primary/10 text-primary" : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {state.message}
          </p>
        )}
        {note && <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{note}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending
            ? t("جارٍ التسجيل...", "Registering...")
            : t("سجّل الأرض", "Register the land")}
        </button>
      </form>

      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted">
            {t("ماذا تكفي مياهك؟", "What does your water support?")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {locale === "en" ? (
              <>
                With {n0(waterPerFeddan)} m³ per feddan, over {n0(feddans)}{" "}
                feddans ({n0(waterPerFeddan * feddans)} m³ for the season):
              </>
            ) : (
              <>
                بـ {n0(waterPerFeddan)} م³ للفدان، وعلى {n0(feddans)} فدان (
                {n0(waterPerFeddan * feddans)} م³ للموسم):
              </>
            )}
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
                      ? t("يكفي بالغمر", "Enough with flood irrigation")
                      : c.okDrip
                        ? t("بالتنقيط فقط", "Drip only")
                        : t("لا يكفي", "Not enough")}
                  </span>
                </div>
                <p className="text-muted">
                  {t("غمر", "Flood")} {n0(c.flood)} · {t("تنقيط", "drip")}{" "}
                  {n0(c.drip)} {t("م³/فدان", "m³/feddan")}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            {t(
              "محسوب بمعيار FAO-56 لزراعة نوفمبر في منطقتك. «بالتنقيط فقط» تعني أن مياهك تكفي المحصول إن رفعت كفاءة الري لا إن رويت بالغمر.",
              "Calculated with the FAO-56 method for November planting in your zone. “Drip only” means your water is enough for the crop if you raise irrigation efficiency, but not if you flood-irrigate.",
            )}
          </p>
        </div>
      </aside>
    </div>
  );
}
