import Link from "next/link";
import { tr, type Locale } from "@/lib/i18n";
import { lbl } from "@/lib/partners";
import { INVESTOR_MODEL_LABEL, type InvestorProfile, type LandRequest } from "@/lib/investors";
import OpenToInvestorsForm from "@/components/invest/OpenToInvestorsForm";
import { COUNTRIES } from "@/lib/phone";
import { button, ghost } from "@/lib/ui";
import { decideInvestorInterest, setInvestorConsent } from "@/app/invest/actions";
import { openAgreement } from "@/app/invest/agreements/actions";
import { openPartnershipConversation } from "@/app/messages/actions";
import { decideInspection } from "@/app/invest/inspections/actions";
import { CHECK_LABEL, INSPECTION_STATUS_LABEL, VERDICT_LABEL, type InspectionRow } from "@/lib/inspections";
import type { Land } from "@/types/database";

/**
 * «اعرض أرضي على المستثمرين» on the owner's own land card (backlog 124): the
 * consent with the partnership models the owner accepts, and the requests
 * waiting for an answer — accepted ones with the investor's phone.
 *
 * `open_to_investors` is undefined on a database the migration has not
 * reached; the card then says nothing rather than offering a button that fails.
 */
export default function LandInvestorConsent({
  land,
  requests,
  inspections = [],
  locale,
}: {
  land: Land;
  requests: LandRequest[];
  /** Inspection requests on this land (backlog 128). */
  inspections?: InspectionRow[];
  locale: Locale;
}) {
  if (land.open_to_investors === undefined) return null;
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const open = land.open_to_investors;

  return (
    <section className="mt-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
      <h3 className="font-bold text-primary">{t("المستثمرون", "Investors")}</h3>

      {land.verification !== "verified" ? (
        <p className="mt-1 text-muted">
          {t(
            "بعد توثيق الأرض تستطيع عرضها على المستثمرين: مشاركة بالمحصول، أو إيجار، أو تمويل مدخلات.",
            "Once the land is verified you can offer it to investors: crop sharing, lease, or input finance.",
          )}
        </p>
      ) : open ? (
        <>
          <p className="mt-1 text-muted">
            {t("أرضك معروضة في ", "Your land is shown on ")}
            <Link href="/invest" className="font-bold text-primary underline">
              {t("فرص الاستثمار", "Investment opportunities")}
            </Link>
            {t(" بنماذج: ", " with: ")}
            {(land.investor_models ?? []).map((m) => lbl(INVESTOR_MODEL_LABEL[m as keyof typeof INVESTOR_MODEL_LABEL], locale)).join(" · ")}.{" "}
            {t(
              "لا يرى المستثمر اسمك ولا هاتفك ولا موقعها حتى تقبل طلبه.",
              "An investor does not see your name, phone or its location until you accept a request.",
            )}
          </p>
          <form action={setInvestorConsent} className="mt-2">
            <input type="hidden" name="land_id" value={land.id} />
            <input type="hidden" name="open" value="false" />
            <button className={ghost}>{t("أوقف عرضها", "Stop showing it")}</button>
          </form>
        </>
      ) : (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted">
            {t(
              "تبحث عن ممّول؟ اعرض أرضك على المستثمرين — دون اسمك أو موقعها حتى توافق.",
              "Looking for finance? Offer your land to investors — without your name or its location until you agree.",
            )}{" "}
            <span className="font-bold text-primary underline">{t("اعرضها", "Offer it")}</span>
          </summary>
          <OpenToInvestorsForm landId={land.id} models={land.investor_models ?? []} note={land.investor_note} locale={locale} />
        </details>
      )}

      {inspections.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {inspections.map((i) => (
            <li key={i.id} className="rounded-lg border border-leaf/30 bg-card px-3 py-2">
              <p className="font-medium">
                {t("طلب معاينةٍ من ", "Inspection request from ")}
                <bdi>{i.investor_name ?? t("مستثمر", "an investor")}</bdi>
                <span className="text-muted">
                  {" — "}
                  {i.verdict ? lbl(VERDICT_LABEL[i.verdict], locale) : lbl(INSPECTION_STATUS_LABEL[i.status], locale)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("يُتحقَّق من: ", "To check: ")}
                {i.checks.map((c) => lbl(CHECK_LABEL[c], locale)).join(" · ")}
              </p>
              {i.status === "requested" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={decideInspection}>
                    <input type="hidden" name="inspection_id" value={i.id} />
                    <input type="hidden" name="accept" value="true" />
                    <button className={button}>{t("أوافق على الزيارة", "I agree to the visit")}</button>
                  </form>
                  <form action={decideInspection}>
                    <input type="hidden" name="inspection_id" value={i.id} />
                    <input type="hidden" name="accept" value="false" />
                    <button className={ghost}>{t("أعتذر", "Decline")}</button>
                  </form>
                  <Link href={`/invest/inspections/${i.id}`} className="self-center text-xs font-bold text-primary underline">
                    {t("التفاصيل", "Details")}
                  </Link>
                </div>
              ) : (
                <Link href={`/invest/inspections/${i.id}`} className="mt-1 inline-block text-xs font-bold text-primary underline">
                  {i.status === "reported" ? t("اقرأ التقرير وردّ عليه", "Read the report and reply") : t("التفاصيل", "Details")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {requests.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.interest_id} className="rounded-lg border border-primary/30 bg-card px-3 py-2">
              <p className="font-medium">
                {r.status === "accepted" ? t("شريكٌ قبلتَه: ", "Accepted partner: ") : t("طلب شراكة من ", "Partnership request from ")}
                <bdi>{r.investor_name ?? t("مستثمر", "an investor")}</bdi>
                <span className="text-muted"> — {lbl(INVESTOR_MODEL_LABEL[r.model], locale)}</span>
              </p>
              {r.profile && <InvestorRecord p={r.profile} locale={locale} />}
              <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" {...arText}>
                {r.message}
              </p>
              {/* صندوق الرسائل (البند ١٣٧): محادثة الطلب، قبل القبول وبعده. */}
              <form action={openPartnershipConversation} className="mt-2">
                <input type="hidden" name="interest_id" value={r.interest_id} />
                <input type="hidden" name="from" value="/lands" />
                <button className={ghost}>{t("💬 راسل المستثمر", "💬 Message the investor")}</button>
              </form>
              {r.status === "accepted" ? (
                <div className="mt-1 text-xs text-muted">
                  {t("هاتفه:", "Phone:")}{" "}
                  {r.investor_phone ? (
                    <a href={`tel:${r.investor_phone}`} className="font-bold text-primary underline">
                      <bdi>{r.investor_phone}</bdi>
                    </a>
                  ) : (
                    t("لم يضف هاتفاً بعد", "none on file yet")
                  )}
                  {" · "}
                  {t("اتّفقا كتابةً قبل أيّ دفع.", "Agree in writing before any payment.")}
                  <form action={openAgreement} className="mt-2">
                    <input type="hidden" name="interest_id" value={r.interest_id} />
                    <input type="hidden" name="from" value="owner" />
                    <button className={button}>{t("اكتبا العقد ووقّعاه هنا", "Write and sign the agreement here")}</button>
                  </form>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={decideInvestorInterest}>
                    <input type="hidden" name="interest_id" value={r.interest_id} />
                    <input type="hidden" name="accept" value="true" />
                    <button className={button}>{t("أقبل وأكشف بياناتي له", "Accept and share my details")}</button>
                  </form>
                  <form action={decideInvestorInterest}>
                    <input type="hidden" name="interest_id" value={r.interest_id} />
                    <input type="hidden" name="accept" value="false" />
                    <button className={ghost}>{t("أعتذر", "Decline")}</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * من يطلب الشراكة (البند ١٣٦): البلد الذي سُجّل منه رقمه، ومنذ متى هو في
 * سوداقري، وما فعله فيها — ليعرف صاحب الأرض من أمامه قبل أن يقبل.
 */
function InvestorRecord({ p, locale }: { p: InvestorProfile; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const country = p.dial_code ? COUNTRIES.find((c) => c.dial === p.dial_code) : undefined;
  const since = p.member_since
    ? new Date(p.member_since).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { month: "long", year: "numeric" })
    : null;
  const parts = [
    country ? t(`من ${country.name}`, `from ${country.nameEn}`) : t("سجّل بالبريد", "signed up by email"),
    since && t(`في سوداقري منذ ${since}`, `on Sudagri since ${since}`),
    t(`طلبات شراكة: ${p.requests_sent}، قُبل منها ${p.requests_accepted}`, `partnership requests: ${p.requests_sent}, ${p.requests_accepted} accepted`),
    t(`عقود موقّعة: ${p.agreements_signed}`, `signed agreements: ${p.agreements_signed}`),
    p.risk_acknowledged && t("أقرّ بتنبيه المخاطرة", "acknowledged the risk notice"),
  ].filter(Boolean);
  return <p className="mt-1 text-xs leading-5 text-muted">{parts.join(" · ")}</p>;
}
