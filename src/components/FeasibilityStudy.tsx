"use client";

import Link from "next/link";
import { publishedCostsFor } from "@/lib/publishedCropCosts";
import { useMemo, useState } from "react";
import {
  ALL_CROPS,
  CROPS,
  NEW_CROPS,
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
  PHASE_VERDICT_LABEL_EN,
  type PhaseVerdict,
} from "@/lib/feasibility";
import {
  IRRIGATION_EN,
  MONTH_EN,
  PRICE_BASIS_EN,
  PRICE_BASIS_NOTE_EN,
  STAGE_EN,
  STATION_SOURCE_EN,
  cropName,
  stationName,
} from "@/lib/enNames";
import { CROP_INPUTS } from "@/lib/cropInputs";
import { INPUT_PRICES, LOCAL_REFERENCES, estimateCostPerFeddan } from "@/lib/inputPrices";
import { irrigationAdvice, PIVOT_MIN_FEDDANS, type Suitability } from "@/lib/irrigationAdvice";
import FeasibilityRisks from "@/components/FeasibilityRisks";
import { createPlanFromStudy } from "@/app/my-project/actions";
import type { LocustSummary } from "@/lib/locust";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

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
  sdgPerUsd = null,
  sdgPerUsdParallel = null,
  initialCrop = "sorghum",
  locust = null,
}: {
  markets: Record<string, CropMarket>;
  /** Crop to open on, e.g. from the new-crops page (?crop=soybean). */
  initialCrop?: string;
  /** Pounds per dollar at the bank and on the parallel market, from /rates. */
  sdgPerUsd?: number | null;
  sdgPerUsdParallel?: number | null;
  /** What FAO's locust survey reported in Sudan over the last year, or null. */
  locust?: LocustSummary | null;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const kgHa = t("كجم/هـ", "kg/ha");
  const [cropKey, setCropKey] = useState(ALL_CROPS.some((c) => c.key === initialCrop) ? initialCrop : "sorghum");
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
    const crop = ALL_CROPS.find((c) => c.key === cropKey)!;
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
          {t("المحصول", "Crop")}
          <select
            value={cropKey}
            onChange={(e) => setCropKey(e.target.value)}
            className={field}
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
          <Link href="/tools/new-crops" className="text-xs text-primary underline">
            {t("ما المحاصيل الجديدة؟ ولماذا نقترحها", "What are the new crops, and why")}
          </Link>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("المنطقة", "Region")}
          <select
            value={stationKey}
            onChange={(e) => setStationKey(e.target.value)}
            className={field}
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
            className={field}
          >
            {(en ? MONTH_EN : MONTH_NAMES).map((m, i) => (
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
          {t("المساحة (فدان)", "Area (feddan)")}
          <input
            type="number"
            min={1}
            value={feddans}
            onChange={(e) => setFeddans(Number(e.target.value))}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("تكلفة العمليات للفدان ($)", "Operations cost per feddan ($)")}
          <input
            type="number"
            min={0}
            value={costPerFeddan}
            onChange={(e) => setCostPerFeddan(Number(e.target.value))}
            className={field}
          />
          {sdgPerUsd !== null && Number.isFinite(costPerFeddan) && costPerFeddan > 0 && (
            <span className="text-xs text-muted">
              {t(
                `≈ ${n0(costPerFeddan * sdgPerUsd)} جنيه بسعر بنك الخرطوم (${n0(sdgPerUsd)} للدولار)`,
                `≈ ${n0(costPerFeddan * sdgPerUsd)} SDG at Bank of Khartoum's rate (${n0(sdgPerUsd)} per dollar)`,
              )}
              {sdgPerUsdParallel !== null &&
                t(
                  ` · ${n0(costPerFeddan * sdgPerUsdParallel)} بالسوق الموازي`,
                  ` · ${n0(costPerFeddan * sdgPerUsdParallel)} at the parallel rate`,
                )}{" "}
              <Link href="/rates" className="text-primary underline">
                {t("الأسعار", "Rates")}
              </Link>
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("سعر المتر المكعب من الماء ($)", "Price of water per cubic metre ($)")}
          <input
            type="number"
            min={0}
            step={0.001}
            value={waterTariff}
            onChange={(e) => setWaterTariff(Number(e.target.value))}
            className={field}
          />
          <span className="text-xs text-muted">
            {t("صفر إن كان المصدر بئرك أو المطر", "Zero if the source is your own well or the rain")}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("سعر الطن ($) — اختياري", "Price per tonne ($) — optional")}
          <input
            type="number"
            min={0}
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder={
              market.priceBasis === "none"
                ? t("لا سعر في البيانات — أدخِله", "No price in the data — enter one")
                : t(`الافتراضي ${n0(market.usdPerTonne ?? 0)}`, `Default ${n0(market.usdPerTonne ?? 0)}`)
            }
            className={field}
          />
          <span className="text-xs text-muted">
            {t("سعرك يعلو على أي تقدير", "Your price overrides any estimate")}
          </span>
        </label>
      </div>

      {/* ── Irrigation advice: the farmer's method stays, the better one is named ── */}
      {(() => {
        const advice = irrigationAdvice(
          cropKey,
          method,
          Number.isFinite(feddans) && feddans > 0 ? feddans : 1,
          study.water.m3PerFeddan * IRRIGATION_EFFICIENCY[method],
        );
        const name = (m: IrrigationMethod) => (en ? IRRIGATION_EN[m] : IRRIGATION_LABEL[m]);
        const fit: Record<Suitability, string> = {
          suited: t("مناسبة", "Suited"),
          possible: t("ممكنة", "Possible"),
          unsuited: t("غير مناسبة", "Not suited"),
        };
        const same = advice.recommended === method;
        return (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-sm">
            <h2 className="mb-2 text-base font-semibold">
              {t("توصية طريقة الري", "Irrigation method advice")}
            </h2>
            <p className="leading-relaxed">
              {same
                ? t(
                    `طريقتك (${name(method)}) هي الأنسب لهذا المحصول وهذه المساحة.`,
                    `Your method (${name(method)}) is the best fit for this crop and this area.`,
                  )
                : t(
                    `الحساب أدناه بطريقتك (${name(method)}). الأنسب لهذا المحصول وهذه المساحة: ${name(advice.recommended)}` +
                      (advice.savingM3PerFeddan > 0
                        ? ` — توفّر نحو ${n0(advice.savingM3PerFeddan)} م³ للفدان في الموسم (${n0(advice.savingShare * 100)}٪ من الماء).`
                        : "."),
                    `The study below uses your method (${name(method)}). Best fit for this crop and area: ${name(advice.recommended)}` +
                      (advice.savingM3PerFeddan > 0
                        ? ` — it saves about ${n0(advice.savingM3PerFeddan)} m³ per feddan over the season (${n0(advice.savingShare * 100)}% of the water).`
                        : "."),
                  )}
            </p>
            <table className="mt-3 w-full text-start text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-start font-medium">{t("الطريقة", "Method")}</th>
                  <th className="py-1 text-start font-medium">{t("للمحصول", "For the crop")}</th>
                  <th className="py-1 text-start font-medium">{t("ماء الفدان في الموسم", "Water per feddan, season")}</th>
                </tr>
              </thead>
              <tbody>
                {advice.methods.map((m) => (
                  <tr key={m.method} className={m.method === advice.recommended ? "font-bold" : ""}>
                    <td className="py-1">
                      {name(m.method)}
                      {m.method === method && <span className="text-muted"> {t("(اختيارك)", "(yours)")}</span>}
                    </td>
                    <td className="py-1">
                      {fit[m.suitability]}
                      {m.tooSmall && m.suitability !== "unsuited" && (
                        <span className="text-muted">
                          {" "}
                          {t(`— لمساحة ${n0(PIVOT_MIN_FEDDANS)} فدان فأكثر`, `— for ${n0(PIVOT_MIN_FEDDANS)} feddan or more`)}
                        </span>
                      )}
                    </td>
                    <td className="py-1">{n0(m.m3PerFeddan)} {t("م³", "m³")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted leading-relaxed">
              {t(
                "المناسبة للمحصول من دليل الفاو لطرق الري (Brouwer وآخرون، 1988): الغمر يناسب كلّ المحاصيل، والرش أغلب المحاصيل الحقلية، والتنقيط الخضر والنخيل والأشجار لا المحاصيل الكثيفة كالقمح. ومن بين المناسبة تُختار الأعلى كفاءة. حدّ المساحة للمحاور الارتكازية قاعدة عملية لا رقم منشور. ولا يدخل هنا ثمن معدّات الري.",
                "Crop suitability follows FAO's training manual on irrigation methods (Brouwer et al., 1988): surface irrigation suits all crops, sprinkler most field crops, drip vegetables, palms and trees but not close-growing crops like wheat. Among the suitable methods the most efficient is chosen. The pivot area threshold is a practical rule, not a published figure. The cost of irrigation equipment is not included here.",
              )}
            </p>
          </div>
        );
      })()}

      {/* ── Per-feddan needs and the platform's own cost estimate ───────── */}
      {(() => {
        const inputs = CROP_INPUTS[cropKey];
        const est = estimateCostPerFeddan(cropKey);
        const range = (r: [number, number] | null, unit: string) =>
          r === null ? t("لم نجد رقماً منشوراً", "No published figure found") : r[0] === r[1] ? `${r[0]} ${unit}` : `${r[0]}–${r[1]} ${unit}`;
        const bags = (r: [number, number]) => (r[0] === r[1] ? `${r[0] / 50}` : `${r[0] / 50}–${r[1] / 50}`);
        const sdg = (usd: number) => (sdgPerUsd !== null ? n0(usd * sdgPerUsd) : null);
        if (!inputs || !est) {
          return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
              {t(
                "هذا محصول جديد: لا توصيات سودانية منشورة لمدخلاته بعد، فأدخل تكلفتك بنفسك. ",
                "This is a new crop: there are no published Sudanese input recommendations yet, so enter your own cost. ",
              )}
              <Link href="/tools/new-crops" className="text-primary underline">
                {t("ما وجدناه عنه", "What we found about it")}
              </Link>
              {(() => {
                const published = publishedCostsFor(cropKey);
                return published.length === 0 ? (
                  <p className="mt-3 text-xs">
                    {t("ولم نجد تكلفةً منشورةً للفدان من هذا المحصول في السودان.", "Nor did we find a published per-feddan cost for this crop in Sudan.")}
                  </p>
                ) : (
                  <div className="mt-3 text-xs">
                    <p className="font-bold text-foreground">
                      {t("تكاليف منشورة للمقارنة — كما كُتبت، بجنيه سنتها:", "Published costs to compare with — as written, in the pounds of their year:")}
                    </p>
                    <ul className="mt-1 list-disc ps-5">
                      {published.map((c) => (
                        <li key={c.figure + c.season}>
                          <span dir="ltr" className="font-bold text-foreground">{c.figure}</span> · {en ? c.basis.en : c.basis.ar} ·{" "}
                          {c.season} · {en ? c.place.en : c.place.ar} ·{" "}
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            {c.source}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1">
                      {t(
                        "أرقامٌ قديمة والجنيه فقد معظم قيمته منذها، فلا تدخل في الحساب؛ التكلفة التي تكتبها أنت هي التي تُحسب.",
                        "Old figures, and the pound has lost most of its value since, so they are not used in the sums; the cost you type is the one the study runs on.",
                      )}
                    </p>
                  </div>
                );
              })()}
            </div>
          );
        }
        return (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="mb-1 text-base font-semibold">{t("احتياجات الفدان", "What one feddan needs")}</h2>
            <p className="mb-3 text-xs text-muted">{en ? inputs.system.en : inputs.system.ar}</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-background px-3 py-2">
                <dt className="text-xs text-muted">{t("البذور", "Seed")}</dt>
                <dd className="font-bold">{range(inputs.seedKg, t("كجم", "kg"))}</dd>
                {inputs.seedNote && <dd className="text-xs text-muted">{en ? inputs.seedNote.en : inputs.seedNote.ar}</dd>}
              </div>
              <div className="rounded-lg bg-background px-3 py-2">
                <dt className="text-xs text-muted">{t("اليوريا", "Urea")}</dt>
                <dd className="font-bold">
                  {inputs.ureaKg ? `${range(inputs.ureaKg, t("كجم", "kg"))} (${bags(inputs.ureaKg)} ${t("جوال", "bags")})` : t("لا تُضاف عادةً", "Not usually applied")}
                </dd>
              </div>
              <div className="rounded-lg bg-background px-3 py-2">
                <dt className="text-xs text-muted">{t("السماد الفوسفاتي", "Phosphate")}</dt>
                <dd className="font-bold">
                  {inputs.phosphate ? `${inputs.phosphate.kind} ${range(inputs.phosphate.kg, t("كجم", "kg"))}` : t("لا توصية منشورة", "No published recommendation")}
                </dd>
              </div>
              <div className="rounded-lg bg-background px-3 py-2">
                <dt className="text-xs text-muted">{t("متى يوضع السماد", "When fertiliser goes on")}</dt>
                <dd>{inputs.timing ? (en ? inputs.timing.en : inputs.timing.ar) : "—"}</dd>
              </div>
              <div className="rounded-lg bg-background px-3 py-2 sm:col-span-2">
                <dt className="text-xs text-muted">{t("المبيدات", "Sprays")}</dt>
                <dd>{inputs.sprays ? (en ? inputs.sprays.en : inputs.sprays.ar) : t("لم نجد معدّلاً منشوراً", "No published rate found")}</dd>
              </div>
              <div className="rounded-lg bg-background px-3 py-2 sm:col-span-2">
                <dt className="text-xs text-muted">{t("العمليات", "Field operations")}</dt>
                <dd>{en ? inputs.operations.en : inputs.operations.ar}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="font-semibold">{t("من أين أشتري؟", "Where do I buy?")}</span>
              {[
                ...(inputs.ureaKg ? [{ item: "urea", ar: "اليوريا", en: "Urea" }] : []),
                ...(inputs.phosphate ? [{ item: inputs.phosphate.kind, ar: inputs.phosphate.kind, en: inputs.phosphate.kind }] : []),
                { item: "seed", ar: "البذور", en: "Seed" },
                ...(inputs.sprays ? [{ item: "pesticide", ar: "المبيدات", en: "Pesticides" }] : []),
              ].map((l) => (
                <Link
                  key={l.item}
                  href={`/suppliers?item=${encodeURIComponent(l.item)}`}
                  className="rounded-full border border-primary/40 px-3 py-1 text-primary hover:bg-primary/10"
                >
                  {en ? l.en : l.ar}
                </Link>
              ))}
            </div>

            <form action={createPlanFromStudy} className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <input type="hidden" name="crop" value={cropKey} />
              <input type="hidden" name="feddans" value={study.feddans} />
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{t("حوّلها إلى مشروع", "Turn it into a project")}</button>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t(
                  "تُنشأ قائمة هذه المدخلات لمساحتك في «مشروعي»: توافق عليها، وتدفع لكلّ مورد مباشرةً، وتسجّل ما دفعت وما استلمت. سوداقري لا تستلم مالك ولا تحفظه.",
                  "This input list is made for your area in “My project”: you approve it, pay each supplier directly, and record what you paid and received. Sudagri does not receive or hold your money.",
                )}
              </p>
            </form>

            <h3 className="mb-2 mt-5 font-semibold">
              {t("متوسط التكلفة المتوقَّع للفدان — تقدير البرنامج", "Expected cost per feddan — the platform's estimate")}
            </h3>
            <table className="w-full text-xs">
              <tbody>
                {est.lines.map((l) => (
                  <tr key={l.en} className="border-t border-border">
                    <td className="py-1">{en ? l.en : l.ar}</td>
                    <td className="py-1 text-muted" dir="ltr">{l.qty}</td>
                    <td className="py-1 font-bold">${l.usd.toFixed(2)}</td>
                    <td className="py-1">{sdg(l.usd) !== null && `${sdg(l.usd)} ${t("جنيه", "SDG")}`}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-bold">
                  <td className="py-1">{t("المجموع المعروف", "Known total")}</td>
                  <td />
                  <td className="py-1">${est.totalUsd.toFixed(2)}</td>
                  <td className="py-1">{sdg(est.totalUsd) !== null && `${sdg(est.totalUsd)} ${t("جنيه", "SDG")}`}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              {t("غير محسوب لأنّا لم نجد سعراً منشوراً له: ", "Not included, for lack of a published price: ")}
              {est.missing.map((m) => (en ? m.en : m.ar)).join(t("، ", ", "))}.
              {" "}
              {t(
                "فهذا حدّ أدنى لا تكلفة كاملة، وتكلفتك التي أدخلتها أعلاه هي التي تُبنى عليها الدراسة. السماد بسعر الميناء العالمي قبل الشحن، والجنيه بسعر بنك الخرطوم.",
                "So this is a floor, not a full cost; the cost you entered above is the one the study runs on. Fertiliser is at the world port price before freight; pounds are at Bank of Khartoum's rate.",
              )}
            </p>
            <ul className="mt-2 list-disc ps-5 text-xs text-muted">
              {LOCAL_REFERENCES.map((r) => (
                <li key={r.source}>
                  {en ? r.en : r.ar}{" "}
                  <a href={r.source} target="_blank" rel="noopener noreferrer" className="underline">
                    {t("المصدر", "source")}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              {t("مصادر الاحتياجات: ", "Sources for the needs: ")}
              {inputs.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && " · "}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline" lang="en" dir="ltr">
                    {s.label}
                  </a>
                </span>
              ))}
              {" · "}
              <a href={INPUT_PRICES.urea.source} target="_blank" rel="noopener noreferrer" className="underline">
                {t("أسعار السماد: البنك الدولي، سبتمبر 2026", "Fertiliser prices: World Bank, September 2026")}
              </a>
            </p>
          </div>
        );
      })()}

      {/* ── Where the numbers came from ─────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">
          {t("المرجعية التي تُقاس عليها", "The reference it is measured against")}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">{t("غلّة السودان", "Sudan's yield")}</dt>
            <dd className="text-lg font-bold">
              {market.sudanKgPerHa === null
                ? "—"
                : `${n0(market.sudanKgPerHa)} ${kgHa}`}
            </dd>
            {market.year && (
              <dd className="text-xs text-muted">FAOSTAT {market.year}</dd>
            )}
          </div>
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">{t("مصر — أقرب نظير مروي", "Egypt — nearest irrigated peer")}</dt>
            <dd className="text-lg font-bold">
              {market.nearestPeerKgPerHa === null
                ? "—"
                : `${n0(market.nearestPeerKgPerHa)} ${kgHa}`}
            </dd>
            <dd className="text-xs text-muted">
              {t("وسيط النظراء", "Peer median")}{" "}
              {market.peerMedianKgPerHa === null
                ? "—"
                : n0(market.peerMedianKgPerHa)}
            </dd>
          </div>
          <div className="rounded-lg bg-background px-3 py-2">
            <dt className="text-xs text-muted">{t("السعر المعتمد", "Price used")}</dt>
            <dd className="text-lg font-bold">
              {market.usdPerTonne === null
                ? "—"
                : `${n0(market.usdPerTonne)} ${t("$/طن", "$/t")}`}
            </dd>
            <dd className="text-xs text-muted">
              {en ? PRICE_BASIS_EN[market.priceBasis] : PRICE_BASIS_LABEL[market.priceBasis]}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {en ? PRICE_BASIS_NOTE_EN[market.priceBasis] : PRICE_BASIS_NOTE[market.priceBasis]}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {en
            ? `Climate of ${stationName(station, locale)}: ${STATION_SOURCE_EN[station.source]}. The comparison is with Egypt and the median of Arab and African peers and India — not with the world's highest yield, which comes from greenhouses an open field cannot be measured against.`
            : `مناخ ${station.name}: ${STATION_SOURCE_LABEL[station.source]}. المقارنة بمصر ووسيط النظراء العرب والأفارقة والهند — لا بأعلى غلّة في العالم، فأعلاها بيوت زجاجية لا تُقاس عليها مزرعة مكشوفة.`}
        </p>
      </div>

      {/* ── The ladder ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {t("السلّم المرحلي — كم التزمتَ، وكم تحتاج لتستردّه", "The phase ladder — what you have committed, and what you need to recover it")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {t(
              "كل مرحلة تعرض ما أُنفق حتى نهايتها، ثم تُحوّله إلى الغلّة التي تُعيده عند الحصاد. القرار الحقيقي ليس «هل الموسم مجدٍ» بل «وقد أنفقتُ ما أنفقت، هل أدفع القسط التالي».",
              "Each phase shows what has been spent by its end, then turns it into the yield that pays it back at harvest. The real decision is not \"is the season viable\" but \"having spent what I have spent, do I pay the next instalment\".",
            )}
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
                  {i + 1}. {en ? (STAGE_EN[p.stage] ?? p.name) : p.name}
                </span>
                <span className="text-xs">
                  {en ? PHASE_VERDICT_LABEL_EN[p.verdict] : PHASE_VERDICT_LABEL[p.verdict]}
                </span>
              </div>

              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-xs opacity-70">{t("قسط المرحلة", "Phase instalment")}</span>
                  <div className="font-medium">{n0(p.cost)} $</div>
                </div>
                <div>
                  <span className="text-xs opacity-70">
                    {t("الملتزم حتى هنا", "Committed so far")} ({Math.round(p.cumulativeShare * 100)}
                    {t("٪", "%")})
                  </span>
                  <div className="font-medium">{n0(p.cumulativeCost)} $</div>
                </div>
                <div>
                  <span className="text-xs opacity-70">
                    {t("غلّة التعادل عند هذه النقطة", "Break-even yield at this point")}
                  </span>
                  <div className="font-bold">
                    {p.breakEvenKgPerHa === null
                      ? "—"
                      : `${n0(p.breakEvenKgPerHa)} ${kgHa}`}
                  </div>
                </div>
              </div>

              {p.lastSafeExit && (
                <p className="mt-2 rounded-lg bg-emerald-900/10 px-3 py-2 text-xs font-medium">
                  {t(
                    "← آخر مرحلة يُسترد ما فيها بالمتوسط الوطني. بعدها تراهن على حصاد أعلى من المعتاد.",
                    "→ The last phase whose spending is recovered at the national average. Beyond it you are betting on a better-than-usual harvest.",
                  )}
                </p>
              )}
            </li>
          ))}
        </ol>

        {study.lastSafeExit === null && (
          <p className="rounded-xl border border-rose-600/30 bg-rose-600/10 p-4 text-sm leading-relaxed text-rose-800">
            {t(
              "لا توجد مرحلة واحدة يُسترد ما فيها بالمتوسط الوطني — أي أن أول قسط يتجاوز ما يعيده هذا المحصول عادةً في السودان. راجع التكلفة أو المحصول أو السعر قبل التوقيع.",
              "Not a single phase is recovered at the national average — the first instalment already exceeds what this crop usually returns in Sudan. Review the cost, the crop or the price before signing.",
            )}
          </p>
        )}
      </div>

      {/* ── Season totals ───────────────────────────────────────── */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t("التكلفة", "Cost")}</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("عمليات حقلية", "Field operations")}</dt>
              <dd>{n0(study.fieldCost)} $</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                {t("ماء", "Water")} ({n0(study.waterM3Total)} {t("م³", "m³")})
              </dt>
              <dd>{n0(study.waterCost)} $</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-bold">
              <dt>{t("الإجمالي", "Total")}</dt>
              <dd>{n0(study.totalCost)} $</dd>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <dt>{t("للفدان", "Per feddan")}</dt>
              <dd>{n0(study.costPerFeddan)} $</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">{t("العائد والهامش", "Revenue and margin")}</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("بالمتوسط الوطني", "At the national average")}</dt>
              <dd>
                {study.revenueAtNational === null
                  ? "—"
                  : `${n0(study.revenueAtNational)} $`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("الهامش", "Margin")}</dt>
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
              <dt className="text-muted">{t("لو بلغتَ غلّة مصر", "If you reached Egypt's yield")}</dt>
              <dd>
                {study.revenueAtPeer === null
                  ? "—"
                  : `${n0(study.revenueAtPeer)} $`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("الهامش عندها", "Margin at that yield")}</dt>
              <dd className="font-bold">
                {study.marginAtPeer === null
                  ? "—"
                  : `${n0(study.marginAtPeer)} $`}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <FeasibilityRisks
        cropKey={cropKey}
        feddans={study.feddans}
        revenueUsd={study.revenueAtNational}
        marginUsd={study.marginAtNational}
        locust={locust}
        locale={locale}
      />

      <p className="text-xs leading-relaxed text-muted">
        {t(
          "الماء موزَّع على المراحل بنفس نسب الميزانية — وهو تقريبٌ نقوله صراحةً: FAO-56 يقسم الموسم أربع مراحل وتقويم المنصّة سبعاً، فلا خريطة أمينة بينهما. التقريب يُقلّل ماء منتصف الموسم حيث يشرب المحصول أكثره، ويتطابق تماماً عند الحصاد — وهو الرقم الذي تدور عليه الدراسة.",
          "Water is spread across the phases in the same shares as the budget — an approximation we state openly: FAO-56 divides the season into four stages and the platform's calendar into seven, so there is no faithful mapping between them. The approximation understates mid-season water, when the crop drinks most, and matches exactly at harvest — the figure the study turns on.",
        )}
      </p>
    </div>
  );
}
