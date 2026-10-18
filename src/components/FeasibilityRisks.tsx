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
  locale,
}: {
  cropKey: string;
  feddans: number;
  revenueUsd: number | null;
  marginUsd: number | null;
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
