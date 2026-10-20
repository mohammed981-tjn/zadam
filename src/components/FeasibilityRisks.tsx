"use client";

import Link from "next/link";
import { useState } from "react";
import { CROP_INPUTS } from "@/lib/cropInputs";
import { SERVICE_BY_KEY } from "@/lib/services";
import {
  FARM_RISKS,
  RISK_BY_KEY,
  defaultSettings,
  summariseRisks,
  type RiskKey,
  type RiskSetting,
} from "@/lib/farmRisks";
import { tr, type Locale } from "@/lib/i18n";
import {
  LOCUST_ALERT_DAYS,
  LOCUST_ALERT_KM,
  LOCUST_FLIGHT_SOURCE,
  LOCUST_HUB_URL,
  isGregarious,
  locustDay,
  locustLabel,
  type LocustSummary,
} from "@/lib/locust";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * «الأخطار وتكلفتها» — the part of the study that prices what can go wrong.
 *
 * Pest control is a cost the farmer knows in advance (sprays × their price);
 * every other risk is priced as an expected loss, how often it comes times how
 * much it takes. Both come off the margin, and the bad year shows whether the
 * season survives its worst single risk. The defaults are the sources' figures
 * and every one can be changed: a farmer's own record of their land beats a
 * study from another state.
 */
export default function FeasibilityRisks({
  cropKey,
  feddans,
  revenueUsd,
  marginUsd,
  locust = null,
  locale,
}: {
  cropKey: string;
  feddans: number;
  revenueUsd: number | null;
  marginUsd: number | null;
  locust?: LocustSummary | null;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const [settings, setSettings] = useState<RiskSetting[]>(defaultSettings);
  const [sprays, setSprays] = useState(0);
  const [sprayUsd, setSprayUsd] = useState(0);

  const update = (key: RiskKey, patch: Partial<RiskSetting>) =>
    setSettings((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const numOrNull = (v: string) => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const protectionUsd =
    Number.isFinite(sprays) && Number.isFinite(sprayUsd) && sprays > 0 && sprayUsd > 0 ? sprays * sprayUsd * feddans : 0;
  const summary = summariseRisks(settings, revenueUsd, marginUsd === null ? null : marginUsd - protectionUsd);
  const sprayNote = CROP_INPUTS[cropKey]?.sprays;
  const field = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("الأخطار وتكلفتها", "Risks and what they cost")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {t(
            "لكلّ خطرٍ سؤالان: كم مرّةً يحدث، وكم يُضيع من المحصول حين يحدث. حاصل ضربهما «الخسارة المتوقّعة» في الموسم، وتُحسب من الهامش كأيّ مصروف. الأرقام المكتوبة من المصادر المذكورة، وغيّرها بما تعرفه عن أرضك.",
            "Every risk asks two questions: how often it happens, and how much of the crop it takes when it does. Their product is the season's expected loss, and it comes off the margin like any cost. The figures filled in are the sources'; change them to what you know of your land.",
          )}
        </p>
      </div>

      {/* ── Pest control: a known cost ─────────────────────────── */}
      <div className="rounded-xl bg-background p-4">
        <h3 className="text-sm font-semibold">{t("مكافحة الآفات — تكلفةٌ معروفة مسبقاً", "Pest control — a cost known in advance")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t(
            "عدد الرشّات × (ثمن المبيد + أجر الرشّ) للفدان. ولا تُرشّ إلّا حين يصير ما تُضيعه الآفة أكبر من ثمن الرشّة. إن كانت المبيدات داخلةً في تكلفة الفدان أعلاه فاترك هذا صفراً.",
            "Sprays × (pesticide + application) per feddan. Spray only once what the pest destroys is worth more than the spray. If pesticides are already in the cost per feddan above, leave this at zero.",
          )}
        </p>
        {sprayNote && (
          <p className="mt-1 text-xs">
            {t("توصية هذا المحصول: ", "This crop's recommendation: ")}
            {en ? sprayNote.en : sprayNote.ar}
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
          <label className="flex flex-col gap-1 text-xs">
            {t("عدد الرشّات", "Number of sprays")}
            <input type="number" min={0} step={1} value={sprays} onChange={(e) => setSprays(Number(e.target.value))} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("الرشّة للفدان ($)", "One spray per feddan ($)")}
            <input type="number" min={0} step="any" value={sprayUsd} onChange={(e) => setSprayUsd(Number(e.target.value))} className={field} />
          </label>
        </div>
        {protectionUsd > 0 && (
          <p className="mt-2 text-sm font-medium">
            {t("تكلفة المكافحة للمساحة كلّها:", "Pest control for the whole area:")} {n0(protectionUsd)} $
          </p>
        )}
      </div>

      {/* ── The risks ──────────────────────────────────────────── */}
      <ul className="flex flex-col gap-3">
        {FARM_RISKS.map((r) => {
          const s = settings.find((x) => x.key === r.key)!;
          const row = summary.rows.find((x) => x.setting.key === r.key)!;
          return (
            <li key={r.key} className={`rounded-xl border p-4 ${s.applies ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={s.applies} onChange={(e) => update(r.key, { applies: e.target.checked })} className="size-4" />
                {en ? r.name.en : r.name.ar}
              </label>

              {s.applies && (
                <>
                  {r.reserveUsd ? (
                    <label className="mt-2 flex max-w-xs flex-col gap-1 text-xs">
                      {t("احتياطيٌّ يُحجز ($)", "Reserve held back ($)")}
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={s.reserveUsd ?? ""}
                        onChange={(e) => update(r.key, { reserveUsd: numOrNull(e.target.value) })}
                        className={field}
                      />
                    </label>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
                      <label className="flex flex-col gap-1 text-xs">
                        {t("مرّةً كلّ … سنوات", "Once every … years")}
                        <input
                          type="number"
                          min={1}
                          step="any"
                          value={s.everyYears ?? ""}
                          placeholder={t("من خبرتك", "From experience")}
                          onChange={(e) => update(r.key, { everyYears: numOrNull(e.target.value) })}
                          className={field}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        {t("يُضيع من المحصول (٪)", "Share of the crop lost (%)")}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={s.lossPct ?? ""}
                          placeholder={t("من خبرتك", "From experience")}
                          onChange={(e) => update(r.key, { lossPct: numOrNull(e.target.value) })}
                          className={field}
                        />
                      </label>
                    </div>
                  )}

                  <p className="mt-2 text-sm">
                    {r.reserveUsd
                      ? s.reserveUsd
                        ? `${t("يُحجز:", "Held back:")} ${n0(s.reserveUsd)} $`
                        : t("اكتب مبلغ الاحتياطيّ.", "Enter the reserve.")
                      : row.expectedUsd !== null
                        ? `${t("الخسارة المتوقّعة في الموسم:", "Expected loss per season:")} ${n0(row.expectedUsd)} $`
                        : revenueUsd === null
                          ? t("أدخل سعر المحصول أعلاه لتُحسب بالدولار.", "Enter the crop price above to price it in dollars.")
                          : t("ينقصه رقم: اكتبه من خبرتك ليدخل الحساب.", "A figure is missing: enter it from experience to count it.")}
                  </p>

                  {r.key === "locust" && locust && <LocustWatch locust={locust} locale={locale} />}
                  {r.basis && <p className="mt-1 text-xs leading-relaxed text-muted">{en ? r.basis.en : r.basis.ar}</p>}
                  <p className="mt-1 text-xs leading-relaxed">
                    <span className="font-medium">{t("كيف يُعالَج: ", "How to handle it: ")}</span>
                    {en ? r.treatment.en : r.treatment.ar}
                    {r.services.length > 0 && (
                      <>
                        {" "}
                        {r.services.map((k) => (
                          <Link key={k} href="/services" className="text-primary underline">
                            {en ? SERVICE_BY_KEY[k].nameEn : SERVICE_BY_KEY[k].name}
                          </Link>
                        ))}
                      </>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    {r.sources.map((src) => (
                      <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="underline">
                        {src.label}
                      </a>
                    ))}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Against the season ─────────────────────────────────── */}
      <div className="rounded-xl bg-background p-4">
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t("الهامش بالمتوسط الوطني", "Margin at the national average")}</dt>
            <dd dir="ltr">{marginUsd === null ? "—" : `${n0(marginUsd)} $`}</dd>
          </div>
          {protectionUsd > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t("ناقص المكافحة", "Less pest control")}</dt>
              <dd dir="ltr">−{n0(protectionUsd)} $</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">{t("ناقص الخسارة المتوقّعة", "Less expected losses")}</dt>
            <dd dir="ltr">{revenueUsd === null ? "—" : `−${n0(summary.expectedTotalUsd)} $`}</dd>
          </div>
          {summary.reserveTotalUsd > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t("ناقص الاحتياطيّ المحجوز", "Less reserves held back")}</dt>
              <dd dir="ltr">−{n0(summary.reserveTotalUsd)} $</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-bold">
            <dt>{t("الهامش بعد الأخطار", "Margin after risks")}</dt>
            <dd dir="ltr" className={summary.marginAfterUsd !== null && summary.marginAfterUsd < 0 ? "text-danger" : ""}>
              {summary.marginAfterUsd === null ? "—" : `${n0(summary.marginAfterUsd)} $`}
            </dd>
          </div>
        </dl>

        {summary.uncounted.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t("لم تدخل الحساب لنقص رقم: ", "Not counted, a figure is missing: ")}
            {summary.uncounted.map((k) => (en ? RISK_BY_KEY[k].name.en : RISK_BY_KEY[k].name.ar)).join(en ? ", " : "، ")}
          </p>
        )}

        {summary.badYear && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed ${
              summary.badYear.marginUsd < 0 ? "bg-rose-600/10 text-rose-800" : "bg-emerald-600/10 text-emerald-800"
            }`}
          >
            <strong>{t("السنة السيّئة: ", "The bad year: ")}</strong>
            {(() => {
              const name = en ? RISK_BY_KEY[summary.badYear.key].name.en : RISK_BY_KEY[summary.badYear.key].name.ar;
              const m = `\u2066${n0(summary.badYear.marginUsd)}\u2069`;
              return summary.badYear.marginUsd < 0
                ? t(
                    `إن وقع «${name}» هذا الموسم صار الهامش ${m} $ — خسارة. فإمّا تأمينٌ أو احتياطيٌّ يغطّيها، أو محصولٌ أو مساحةٌ أخرى، قبل البذر.`,
                    `If “${name}” strikes this season the margin becomes $${m} — a loss. Cover it with insurance or a reserve, or choose another crop or area, before sowing.`,
                  )
                : t(
                    `إن وقع «${name}» هذا الموسم بقي الهامش ${m} $ — الموسم يحتمل أسوأ خطرٍ فيه.`,
                    `If “${name}” strikes this season the margin stays at $${m} — the season survives its worst risk.`,
                  );
            })()}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * What FAO's survey teams reported in Sudan in the last twelve months. Counts
 * and dates only, as FAO holds them; the caveat is part of the figure, since a
 * place nobody could reach reports nothing.
 */
function LocustWatch({ locust, locale }: { locust: LocustSummary; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const gregarious = locust.counts.some((c) => isGregarious(c.category));
  const km = (v: number) => Math.round(v).toLocaleString("en-US");
  const near = (locust.lands ?? []).filter((l) => l.nearest && l.nearest.km <= LOCUST_ALERT_KM);
  return (
    <div className="mt-2 rounded-lg bg-background p-3 text-xs leading-relaxed">
      {/* ── قرب أرضك ─────────────────────────────────── */}
      {near.length > 0 && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-bold text-danger">{t("⚠ رُصد جرادٌ قرب أرضك", "⚠ Locusts were recorded near your land")}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {near.map((l) => (
              <li key={l.land}>
                {t(
                  `«${l.land}»: ${locustLabel(l.nearest!.category, locale)} على بعد ${km(l.nearest!.km)} كم، في ${locustDay(l.nearest!.date, locale)}`,
                  `“${l.land}”: ${locustLabel(l.nearest!.category, locale)} ${km(l.nearest!.km)} km away, on ${locustDay(l.nearest!.date, locale)}`,
                )}{" "}
                (<span dir="ltr">{[l.nearest!.place, l.nearest!.country].filter(Boolean).join(", ")}</span>)
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            {t(
              `الفاو: يطير الجراد نهاراً مع الريح حتى ${LOCUST_ALERT_KM} كم في اليوم. بلّغ وقاية النباتات في ولايتك، وتفقّد الحقل صباحاً.`,
              `FAO: locusts fly by day downwind for up to ${LOCUST_ALERT_KM} km a day. Tell plant protection in your state, and check the field in the morning.`,
            )}{" "}
            <a href={LOCUST_FLIGHT_SOURCE} target="_blank" rel="noopener noreferrer" className="underline">
              {t("الفاو", "FAO")}
            </a>
          </p>
        </div>
      )}
      {locust.signedIn && locust.lands !== null && locust.lands.length > 0 && near.length < locust.lands.length && (
        <p className="mb-2">
          {locust.lands
            .filter((l) => !(l.nearest && l.nearest.km <= LOCUST_ALERT_KM))
            .map((l) =>
              l.nearest
                ? t(
                    `«${l.land}»: أقرب رصدٍ في آخر ${LOCUST_ALERT_DAYS} يوماً على بعد ${km(l.nearest.km)} كم — أبعد من مسيرة يوم (${LOCUST_ALERT_KM} كم).`,
                    `“${l.land}”: the nearest sighting in the last ${LOCUST_ALERT_DAYS} days is ${km(l.nearest.km)} km away — beyond a day's flight (${LOCUST_ALERT_KM} km).`,
                  )
                : t(
                    `«${l.land}»: لم يصل الفاو رصدٌ لجراد حول السودان في آخر ${LOCUST_ALERT_DAYS} يوماً.`,
                    `“${l.land}”: no locust sighting around Sudan reached FAO in the last ${LOCUST_ALERT_DAYS} days.`,
                  ),
            )
            .join(" ")}
        </p>
      )}
      {locust.signedIn && locust.lands !== null && locust.lands.length === 0 && (
        <p className="mb-2">
          {t("أضف موقع أرضك (خطّ العرض والطول) في ", "Add your land's location (latitude and longitude) in ")}
          <Link href="/lands" className="text-primary underline">{t("أراضيّ", "My lands")}</Link>
          {t(" ليصلك إشعارٌ إن رُصد جرادٌ قربها، ولو لم تفتح هذه الصفحة.", " and you will be notified when locusts are recorded near it, even without opening this page.")}
        </p>
      )}
      {!locust.signedIn && (
        <p className="mb-2">
          <Link href="/login" className="text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>
          {t(" وأضف موقع أرضك ليصلك إشعارٌ إن رُصد جرادٌ قربها.", " and add your land's location, and you will be notified when locusts are recorded near it.")}
        </p>
      )}

      <p className="font-medium">{t("ما رصدته الفاو في السودان خلال آخر ١٢ شهراً", "What FAO recorded in Sudan in the last 12 months")}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {locust.counts.map((c) => (
          <li key={c.category}>
            {locustLabel(c.category, locale)}: <span dir="ltr">{c.count.toLocaleString("en-US")}</span>
            {" — "}
            {t("آخرها", "latest")} {locustDay(c.lastDate, locale)}
          </li>
        ))}
      </ul>
      {!gregarious && (
        <p className="mt-1">{t("لم تُسجَّل أسرابٌ ولا أشرطة حوريّات.", "No swarms or hopper bands were recorded.")}</p>
      )}
      {locust.places.length > 0 && (
        <p className="mt-1">
          {t("آخر أماكن الرصد: ", "Latest places: ")}
          {locust.places.map((p, i) => (
            <span key={`${p.place}-${p.category}`}>
              {i > 0 && t("، ", ", ")}
              <span dir="ltr">{p.place}</span> ({locustLabel(p.category, locale)}{t("، ", ", ")}{locustDay(p.lastDate, locale)})
            </span>
          ))}
        </p>
      )}
      <p className="mt-1 text-muted">
        {t(
          "يُعدّ ما وصل إلى الفاو من فرق المسح وحدَه: مكانٌ لم يصله أحدٌ لا يُرسل شيئاً.",
          "Only what survey teams sent to FAO is counted: a place nobody reached sends nothing.",
        )}{" "}
        <a href={LOCUST_HUB_URL} target="_blank" rel="noopener noreferrer" className="underline">
          {t("خريطة الجراد — الفاو", "FAO Locust Hub")}
        </a>
      </p>
    </div>
  );
}
