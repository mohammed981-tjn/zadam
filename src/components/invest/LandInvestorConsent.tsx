import Link from "next/link";
import { tr, type Locale } from "@/lib/i18n";
import { lbl } from "@/lib/partners";
import { INVESTOR_MODEL_DETAIL, INVESTOR_MODEL_LABEL, INVESTOR_MODELS, type LandRequest } from "@/lib/investors";
import { button, field, ghost } from "@/lib/ui";
import { decideInvestorInterest, setInvestorConsent } from "@/app/invest/actions";
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
  locale,
}: {
  land: Land;
  requests: LandRequest[];
  locale: Locale;
}) {
  if (land.open_to_investors === undefined) return null;
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const open = land.open_to_investors;
  const chosen = new Set(land.investor_models ?? []);

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
          <form action={setInvestorConsent} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="land_id" value={land.id} />
            <input type="hidden" name="open" value="true" />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-bold">{t("ما الشراكة التي تقبلها؟", "Which partnerships do you accept?")}</legend>
              {INVESTOR_MODELS.map((m) => (
                <label key={m} className="flex items-start gap-2">
                  <input type="checkbox" name="models" value={m} defaultChecked={chosen.size === 0 || chosen.has(m)} className="mt-1 size-4" />
                  <span>
                    <span className="font-bold">{lbl(INVESTOR_MODEL_LABEL[m], locale)}</span>
                    <span className="block text-xs text-muted">{lbl(INVESTOR_MODEL_DETAIL[m].owner, locale)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              {t("سطرٌ عن أرضك للمستثمر (اختياري)", "A line about your land for investors (optional)")}
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                defaultValue={land.investor_note ?? ""}
                className={field}
                placeholder={t(
                  "مثال: أرضٌ على النيل بمضخّة تعمل، زرعتُها بامية وطماطم، وأريد ممّولاً للموسم الشتوي.",
                  "e.g. Land on the Nile with a working pump; grew okra and tomato; looking for finance for the winter season.",
                )}
              />
              <span className="text-xs text-muted">
                {t("لا تكتب اسمك ولا هاتفك هنا — يُكشفان بعد موافقتك.", "Don't write your name or phone here — they are shared after you agree.")}
              </span>
            </label>
            <button className={`${button} self-start`}>{t("اعرض أرضي على المستثمرين", "Offer my land to investors")}</button>
          </form>
        </details>
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
              <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" {...arText}>
                {r.message}
              </p>
              {r.status === "accepted" ? (
                <p className="mt-1 text-xs text-muted">
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
                </p>
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
