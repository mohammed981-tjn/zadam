import Link from "next/link";
import { tr, type Locale } from "@/lib/i18n";
import { cropName, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { soilEstimateWords } from "@/lib/soilPoint";
import { AREA_BAND_SHORT, lbl, type AreaBand } from "@/lib/partners";
import { INTEREST_STATUS_LABEL, INVESTOR_MODEL_LABEL, RISK_NOTICE, type OpenLand } from "@/lib/investors";
import {
  CHECK_DETAIL,
  CHECK_LABEL,
  INSPECTION_CHECKS,
  INSPECTION_STATUS_LABEL,
  feeLine,
  type InspectionRow,
} from "@/lib/inspections";
import { button, card, field, ghost, label } from "@/lib/ui";
import { expressInvestorInterest } from "@/app/invest/actions";
import { requestInspection } from "@/app/invest/inspections/actions";
import { investorSignupTo } from "@/lib/authEntry";

/**
 * One verified land offered to investors (backlogs 124, 128, 129).
 *
 * The same card wherever an investor meets the land — «فرص الاستثمار» and the
 * projects page — so it says the same things and asks the same questions in
 * both: no name, no village, no coordinates, no owner, until the owner accepts.
 */
export default function LandOfferCard({
  land: l,
  signedIn,
  fee,
  inspection,
  inspectionsOn,
  locale,
  returnTo,
}: {
  land: OpenLand;
  signedIn: boolean;
  /** The inspection fee for new requests; null is free. */
  fee: number | null;
  /** The caller's own open inspection on this land, if any. */
  inspection?: InspectionRow;
  /** False on a database the inspection migration has not reached. */
  inspectionsOn: boolean;
  locale: Locale;
  /** A project page the card sits on, so a refused request returns there rather than to /invest. */
  returnTo?: string;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const band = l.area_band as AreaBand | null;
  const soil = (s: string | null) => (s ? (locale === "en" ? wrbShortEn(s) : wrbShort(s)) : "—");
  const soilWords = soilEstimateWords(l.soil_source, l.soil_pct, t);

  return (
    <li id={`land-${l.land_id}`} className={`${card} flex scroll-mt-24 flex-col`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-black" {...arText}>
          {[l.state, l.locality].filter(Boolean).join(" · ")}
        </h3>
        <span className="rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-bold text-leaf">{t("أرض موثّقة", "Verified land")}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        <bdi className="font-bold text-foreground">{Number(l.feddans).toLocaleString("en-US")}</bdi> {t("فدان", "feddans")}
        {band && AREA_BAND_SHORT[band] ? ` · ${lbl(AREA_BAND_SHORT[band], locale)}` : ""}
        {l.documents_on_file > 0 ? ` · ${t(`${l.documents_on_file} مستندات في الملفّ`, `${l.documents_on_file} documents on file`)}` : ""}
      </p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {l.models.map((m) => (
          <li key={m} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {lbl(INVESTOR_MODEL_LABEL[m], locale)}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted">{t("مصدر المياه", "Water source")}</dt>
          <dd className="font-medium">{waterSourceLabel(l.water_source, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("المياه للفدان (يعلنها المالك)", "Water per feddan (declared by the owner)")}</dt>
          <dd className="font-medium">
            {l.water_per_feddan ? `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} ${t("م³", "m³")}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{soilWords.label}</dt>
          <dd className="font-medium">
            {soil(l.soil_class)}
            {l.soil_class && soilWords.confidence && <span className="block text-xs font-normal text-muted">{soilWords.confidence}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("المنطقة المناخيّة", "Climate zone")}</dt>
          <dd className="font-medium">{stationName(l.station_key, locale)}</dd>
        </div>
        {l.crop_keys.length > 0 && (
          <div className="col-span-2">
            <dt className="text-xs text-muted">{t("المحاصيل التي يريدها", "Crops the owner wants")}</dt>
            <dd className="font-medium">{l.crop_keys.map((c) => cropName(c, locale)).join(" · ")}</dd>
          </div>
        )}
      </dl>

      {l.note && (
        <blockquote className="mt-3 rounded-xl bg-background px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]" {...arText}>
          «{l.note}»
        </blockquote>
      )}

      <div className="mt-auto pt-4">
        {l.mine ? (
          <p className="text-sm font-bold text-muted">{t("هذه أرضك.", "This is your land.")}</p>
        ) : l.interest_status ? (
          <Link href="/invest/mine" className={`${ghost} inline-block`}>
            {lbl(INTEREST_STATUS_LABEL[l.interest_status], locale)}
          </Link>
        ) : !signedIn ? (
          // A new account with «أستثمر» chosen, back to this land after; one
          // with an account signs in on the same screen.
          <Link href={investorSignupTo(returnTo ?? `/invest#land-${l.land_id}`)} className={`${button} inline-block`}>
            {t("سجّل كمستثمر لتطلب الشراكة", "Sign up as an investor to request a partnership")}
          </Link>
        ) : (
          <details className="group">
            <summary className={`${button} inline-block cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              {t("اطلب الشراكة", "Request a partnership")}
            </summary>
            <form action={expressInvestorInterest} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="land_id" value={l.land_id} />
              {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 font-bold">{t("نموذج الشراكة", "Partnership model")}</legend>
                {l.models.map((m, i) => (
                  <label key={m} className="flex items-center gap-2">
                    <input type="radio" name="model" value={m} defaultChecked={i === 0} className="size-4" />
                    {lbl(INVESTOR_MODEL_LABEL[m], locale)}
                  </label>
                ))}
              </fieldset>
              <label className={label}>
                {t("رسالتك لصاحب الأرض", "Your message to the owner")}
                <textarea
                  name="message"
                  rows={3}
                  minLength={10}
                  maxLength={1000}
                  required
                  className={field}
                  placeholder={t("من أنت، وماذا تقترح، ومتى تريد البدء.", "Who you are, what you propose, and when you want to start.")}
                />
              </label>
              <p className="text-xs leading-5 text-muted">
                {t(
                  "يصل صاحبَ الأرض إشعار. يرى اسمك، والبلد الذي سجّلت منه رقمك، وعدد عقودك الموقّعة على سوداقري؛ وهاتفك وموقع الأرض لا يُكشفان إلا بعد قبوله.",
                  "The owner is notified. They see your name, the country your number is from and how many agreements you have signed on Sudagri; your phone and the land's location are shared only once they accept.",
                )}
              </p>
              {/* البند ١٣٦: لا يُرسل الطلب قبل الإقرار بالمخاطرة، ويُحفظ الإقرار معه. */}
              <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm leading-6">
                <p className="font-bold">{t("قبل أن ترسل", "Before you send")}</p>
                <p className="mt-1">{lbl(RISK_NOTICE, locale)}</p>
                <label className="mt-2 flex items-start gap-2 font-medium">
                  <input type="checkbox" name="risk_ack" value="yes" required className="mt-1 size-4 shrink-0" />
                  {t("قرأتُ هذا وفهمته.", "I have read and understood this.")}
                </label>
              </div>
              <button className={`${button} self-start`}>{t("أرسل الطلب", "Send the request")}</button>
            </form>
          </details>
        )}

        {inspectionsOn && !l.mine && signedIn && (
          <div className="mt-3 border-t border-border pt-3">
            {inspection ? (
              <Link href={`/invest/inspections/${inspection.id}`} className="text-sm font-bold text-leaf underline">
                {t("معاينتك: ", "Your inspection: ")}
                {lbl(INSPECTION_STATUS_LABEL[inspection.status], locale)}
              </Link>
            ) : (
              <details>
                <summary className="cursor-pointer text-sm font-bold text-leaf underline">
                  {t("اطلب تقرير معاينةٍ مستقلّ قبل أن تقرّر", "Ask for an independent inspection before you decide")}
                </summary>
                <form action={requestInspection} className="mt-3 flex flex-col gap-3 text-sm">
                  <input type="hidden" name="land_id" value={l.land_id} />
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1 font-bold">{t("ما الذي يتحقّق منه المفتّش؟", "What should the inspector check?")}</legend>
                    {INSPECTION_CHECKS.map((c) => (
                      <label key={c} className="flex items-start gap-2">
                        <input type="checkbox" name="checks" value={c} defaultChecked className="mt-1 size-4" />
                        <span>
                          <span className="font-bold">{lbl(CHECK_LABEL[c], locale)}</span>
                          <span className="block text-xs text-muted">{lbl(CHECK_DETAIL[c], locale)}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label className={label}>
                    {t("ما يهمّك أكثر (اختياري)", "What matters most to you (optional)")}
                    <textarea name="note" rows={2} maxLength={1000} className={field} />
                  </label>
                  <p className="text-xs leading-5 text-muted">
                    {feeLine(fee, locale)}{" "}
                    {t(
                      "يزور الأرضَ مفتّشٌ تعيّنه سوداقري بعد موافقة صاحبها، وليس طرفاً في شيء. ولا تعرف اسم صاحب الأرض ولا موقعها من التقرير.",
                      "An inspector appointed by Sudagri visits the land once its owner agrees, and is party to nothing. The report does not tell you the owner's name or where the land is.",
                    )}
                  </p>
                  <button className={`${ghost} self-start`}>{t("اطلب المعاينة", "Request the inspection")}</button>
                </form>
              </details>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
