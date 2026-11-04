import Link from "next/link";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import { cropName, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { dateLabel, isNotDeployed, num } from "@/lib/supplyChain";
import { explain } from "@/lib/supplyActions";
import {
  AREA_BAND_SHORT,
  INTEREST_STATUS,
  lbl,
  type InterestContact,
  type MatchingLand,
  type PartnerInterest,
} from "@/lib/partners";
import PartnersShell from "@/components/partners/PartnersShell";
import { ComingSoon, button, card, field, ghost } from "@/components/supply/SupplyShell";
import { expressInterest, withdrawInterest } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "المزارع المطابقة | سوداقري", "Matching farms | Sudagri") };
}

/**
 * What a verified company sees: farms whose owners opened them, matching one
 * of its active agreements — by group, never by owner or place — and, once an
 * owner accepts a request, that owner's contact details.
 */
export default async function MatchingLandsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let lands: MatchingLand[] = [];
  let contacts: InterestContact[] = [];
  let pending: PartnerInterest[] = [];
  let refusal: string | null = null;
  let notDeployed = false;
  if (user) {
    const { data, error } = await supabase.rpc("partner_matching_lands");
    notDeployed = isNotDeployed(error);
    if (error && !notDeployed) refusal = explain(locale, error);
    lands = ((data ?? []) as MatchingLand[]).sort((a, b) => a.state.localeCompare(b.state, "ar") || Number(b.feddans) - Number(a.feddans));
    if (!error) {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.rpc("partner_interest_contacts"),
        supabase.from("partner_interests").select("*").eq("status", "pending"),
      ]);
      contacts = (c ?? []) as InterestContact[];
      pending = (p ?? []) as PartnerInterest[];
    }
  }

  const soil = (s: string | null) => (s ? (locale === "en" ? wrbShortEn(s) : wrbShort(s)) : t("غير معروفة", "Unknown"));

  return (
    <PartnersShell active="/partners/lands" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("المزارع المطابقة لاتّفاقاتك", "Farms matching your agreements")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "أراضٍ موثّقة فتحها أصحابها للشركات الشريكة، وتطابق اتّفاقاً مفعَّلاً لشركتك. ترى مجموعتها ومساحتها ومحليّتها فقط. وإن أرسلت طلباً وقبله صاحب الأرض، ظهر لك اسمه وهاتفه وموقع الأرض أسفل هذه الصفحة.",
          "Verified land whose owners opened it to partner companies, matching one of your company’s active agreements. You see only its group, area and locality. If you send a request and the owner accepts, their name, phone and the land’s location appear at the bottom of this page.",
        )}
      </p>

      {!user ? (
        <p className={`${card} mt-6 text-sm`}>
          <Link href={loginTo("/partners/lands")} className="font-medium text-primary underline">
            {t("سجّل الدخول", "Sign in")}
          </Link>{" "}
          {t("بحساب شركتك.", "with your company’s account.")}
        </p>
      ) : notDeployed ? (
        <div className="mt-6">
          <ComingSoon />
        </div>
      ) : refusal ? (
        <div className={`${card} mt-6 text-sm`}>
          <p>{refusal}</p>
          <Link href="/partners/mine" className="mt-2 inline-block text-primary underline">
            {t("سجّل شركتك واكتب اتّفاقها ←", "Register your company and write its agreement →")}
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6">
            {lands.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
                <p className="font-bold">{t("لا مزرعة مطابقة الآن.", "No matching farm right now.")}</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                  {t(
                    "تظهر المزارع هنا حين يفعّل المشرف اتّفاقك، ويفتح أصحاب الأراضي الموثّقة أراضيهم للشركاء. وكلّما وسّعت مجموعة الاتّفاق ظهر لك أكثر.",
                    "Farms appear here once an administrator activates your agreement and owners of verified land open it to partners. The wider the agreement’s group, the more you see.",
                  )}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {lands.map((l) => {
                  const mine = pending.find((p) => p.land_id === l.land_id);
                  return (
                    <li key={l.land_id} className={card}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold">
                          {stateName(l.state, locale)}
                          {l.locality && (
                            <>
                              {" · "}
                              <bdi>{l.locality}</bdi>
                            </>
                          )}
                        </p>
                        <span className="text-sm">
                          <span className="figure">{num(Number(l.feddans), locale, 1)}</span> {t("فدان", "feddans")}
                          {l.area_band && ` · ${lbl(AREA_BAND_SHORT[l.area_band], locale)}`}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {waterSourceLabel(l.water_source, locale)} · {t("التربة:", "Soil:")} {soil(l.soil_class)} · {stationName(l.station_key, locale)}
                      </p>
                      {l.crop_keys.length > 0 && (
                        <p className="mt-1 text-sm">
                          {t("يريد زراعة:", "Wants to grow:")} {l.crop_keys.map((c) => cropName(c, locale)).join(locale === "en" ? ", " : "، ")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        {t("يطابق اتّفاق:", "Matches agreement:")} <bdi>{l.agreement_title}</bdi>
                      </p>
                      {l.interest_status ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                          <span className="font-medium text-accent">{lbl(INTEREST_STATUS[l.interest_status], locale)}</span>
                          {mine && (
                            <form action={withdrawInterest}>
                              <input type="hidden" name="interest_id" value={mine.id} />
                              <button className={ghost}>{t("اسحب الطلب", "Withdraw")}</button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <details className="mt-3 text-sm">
                          <summary className="cursor-pointer font-medium text-primary">{t("أرسل طلباً لصاحب الأرض", "Send the owner a request")}</summary>
                          <form action={expressInterest} className="mt-2 flex flex-col gap-2">
                            <input type="hidden" name="land_id" value={l.land_id} />
                            <textarea
                              name="message"
                              required
                              minLength={10}
                              maxLength={1000}
                              rows={3}
                              className={field}
                              placeholder={t("ما الذي تقترحه: الخدمات، والموعد، والسعر الإرشاديّ.", "What you propose: the services, the timing, the indicative price.")}
                              aria-label={t("الرسالة", "Message")}
                            />
                            <button className={`${button} self-start`}>{t("أرسل", "Send")}</button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={`${card} mt-8`}>
            <h2 className="font-bold">{t("طلباتٌ قبلها أصحاب الأراضي", "Requests the owners accepted")}</h2>
            {contacts.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t("لا شيء بعد.", "None yet.")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {contacts.map((c) => (
                  <li key={c.interest_id} className="rounded-xl border border-border px-3 py-3 text-sm">
                    <p className="font-medium">
                      <bdi>{c.land_name}</bdi> — {stateName(c.state, locale)}
                      {c.locality && (
                        <>
                          {" · "}
                          <bdi>{c.locality}</bdi>
                        </>
                      )}
                      {c.village && (
                        <>
                          {" · "}
                          <bdi>{c.village}</bdi>
                        </>
                      )}
                    </p>
                    <p className="mt-1">
                      {t("صاحب الأرض:", "Owner:")} <bdi>{c.owner_name || "—"}</bdi>
                      {c.owner_phone && (
                        <>
                          {" · "}
                          <a href={`tel:${c.owner_phone}`} className="text-primary underline">
                            <bdi className="figure">{c.owner_phone}</bdi>
                          </a>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="figure">{num(Number(c.feddans), locale, 1)}</span> {t("فدان", "feddans")}
                      {c.latitude != null && c.longitude != null && (
                        <>
                          {" · "}
                          <a
                            href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            {t("الموقع على الخريطة", "Location on the map")}
                          </a>
                        </>
                      )}
                      {" · "}
                      {t(`قُبل في ${dateLabel(c.decided_at.slice(0, 10), locale)}`, `accepted on ${dateLabel(c.decided_at.slice(0, 10), locale)}`)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PartnersShell>
  );
}
