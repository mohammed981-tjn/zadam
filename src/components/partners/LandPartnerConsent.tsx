import { tr, type Locale } from "@/lib/i18n";
import { cropName } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { soilAt } from "@/lib/rainMap";
import {
  AREA_BAND_SHORT,
  PARTNER_CROP_KEYS,
  PARTNER_KIND_LABEL,
  areaBand,
  lbl,
  type PartnerCompany,
  type PartnerInterest,
} from "@/lib/partners";
import { decideInterest, setLandConsent } from "@/app/partners/actions";
import type { Land } from "@/types/database";

const button =
  "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90";
const ghost = "rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:border-primary";

/**
 * «افتح أرضك للشركات الشريكة» on the owner's own land card: the consent, the
 * group the land falls in, and the requests waiting for an answer.
 *
 * `open_to_partners` is undefined on a database the partner migration has not
 * reached; the card then says the feature is coming rather than offering a
 * button that would fail.
 */
export default function LandPartnerConsent({
  land,
  interests,
  companies,
  locale,
}: {
  land: Land;
  interests: PartnerInterest[];
  companies: Map<string, Pick<PartnerCompany, "id" | "name" | "kinds" | "phone">>;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const soil = land.soil_class ?? soilAt(land.longitude, land.latitude);
  const band = areaBand(land.feddans);
  const group = [
    soil ? (locale === "en" ? wrbShortEn(soil) : wrbShort(soil)) : t("التربة تُعرف من الإحداثيّات", "soil is read from the coordinates"),
    band ? lbl(AREA_BAND_SHORT[band], locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm">
      <h3 className="font-bold">{t("الشركات الزراعيّة الشريكة", "Partner farming companies")}</h3>

      {land.open_to_partners === undefined ? (
        <p className="mt-1 text-muted">
          {t(
            "قريباً تستطيع أن تفتح أرضك للشركات الشريكة، فتعرض عليك الشركة المطابقة خدماتها دون أن ترى اسمك أو موقع أرضك قبل موافقتك.",
            "Soon you will be able to open your land to partner companies: a matching company offers you its services without seeing your name or your land’s location before you agree.",
          )}
        </p>
      ) : land.verification !== "verified" ? (
        <p className="mt-1 text-muted">
          {t("بعد توثيق الأرض تستطيع فتحها للشركات الشريكة.", "Once the land is verified you can open it to partner companies.")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            {t("مجموعة أرضك: ", "Your land’s group: ")}
            {group}.{" "}
            {land.open_to_partners
              ? t(
                  "أرضك مفتوحة للشركات المطابقة. ترى الشركة الولاية والمحليّة والمساحة والمجموعة فقط، ولا ترى اسمك ولا موقع الأرض حتى تقبل طلبها.",
                  "Your land is open to matching companies. A company sees only the state, locality, area and group — not your name or the land’s location until you accept its request.",
                )
              : t(
                  "افتحها للشركات الشريكة لتعرض عليك الشركات المطابقة خدماتها. لا ترى الشركة اسمك ولا موقع الأرض حتى تقبل طلبها.",
                  "Open it to partner companies so matching companies can offer you their services. A company does not see your name or the land’s location until you accept its request.",
                )}
          </p>
          <form action={setLandConsent} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="land_id" value={land.id} />
            <input type="hidden" name="open" value={land.open_to_partners ? "false" : "true"} />
            {!land.open_to_partners && (
              <details>
                <summary className="cursor-pointer">{t("المحاصيل التي تريدها في أرضك (اختياري، حتى ٨)", "Crops you want on your land (optional, up to 8)")}</summary>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {PARTNER_CROP_KEYS.map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="checkbox" name="crop_keys" value={c} defaultChecked={land.crop_keys?.includes(c)} className="size-4" />
                      {cropName(c, locale)}
                    </label>
                  ))}
                </div>
              </details>
            )}
            <button className={`${land.open_to_partners ? ghost : button} self-start`}>
              {land.open_to_partners ? t("أغلقها أمام الشركات", "Close it to companies") : t("افتح أرضي للشركات الشريكة", "Open my land to partner companies")}
            </button>
          </form>
        </>
      )}

      {interests.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {interests.map((i) => {
            const c = companies.get(i.company_id);
            return (
              <li key={i.id} className="rounded-lg border border-accent/50 px-3 py-2">
                <p className="font-medium">
                  {t("طلب من ", "Request from ")}
                  <bdi>{c?.name ?? t("شركة شريكة", "a partner company")}</bdi>
                  {c && <span className="text-muted"> — {c.kinds.map((k) => lbl(PARTNER_KIND_LABEL[k], locale)).join(" · ")}</span>}
                </p>
                <p className="mt-1 whitespace-pre-line" {...(locale === "en" ? { lang: "ar", dir: "auto" } : {})}>
                  {i.message}
                </p>
                {c?.phone && (
                  <p className="mt-1 text-xs text-muted">
                    {t("هاتف الشركة:", "Company phone:")} <bdi className="figure">{c.phone}</bdi>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={decideInterest}>
                    <input type="hidden" name="interest_id" value={i.id} />
                    <input type="hidden" name="accept" value="true" />
                    <button className={button}>{t("أقبل وأكشف بياناتي لهم", "Accept and share my details")}</button>
                  </form>
                  <form action={decideInterest}>
                    <input type="hidden" name="interest_id" value={i.id} />
                    <input type="hidden" name="accept" value="false" />
                    <button className={ghost}>{t("أعتذر", "Decline")}</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
