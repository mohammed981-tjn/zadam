import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import InvestTabs from "@/components/invest/InvestTabs";
import { INTEREST_STATUS_LABEL, INVESTOR_MODEL_LABEL, type MyInterest } from "@/lib/investors";
import { lbl } from "@/lib/partners";
import { button, card, ghost } from "@/lib/ui";
import { withdrawInvestorInterest } from "../actions";
import { openAgreement } from "../agreements/actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "طلباتي | فرص الاستثمار | سوداقري", "My requests | Investment | Sudagri") };
}

/**
 * The investor's own partnership requests (backlog 124). The land's name and
 * place, and the owner's name and phone, come back from the database only for
 * a request the owner has accepted — investor_my_interests() masks the rest.
 */
export default async function MyInvestorRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const { data, error } = await supabase.rpc("investor_my_interests");
  if (error) console.error("invest/mine: read failed", error);
  const rows = (data ?? []) as MyInterest[];

  const tone: Record<MyInterest["status"], string> = {
    pending: "bg-accent/10 text-accent",
    accepted: "bg-leaf/10 text-leaf",
    declined: "bg-border text-muted",
    withdrawn: "bg-border text-muted",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="chart" eyebrow={t("للمستثمرين", "For investors")} title={t("طلباتي", "My requests")}>
        {t(
          "طلبات الشراكة التي أرسلتها. حين يقبل صاحب الأرض يظهر هنا اسمه وهاتفه وموقع الأرض.",
          "The partnership requests you sent. Once an owner accepts, their name, phone and the land's location appear here.",
        )}
      </PageHeader>
      <InvestTabs active="/invest/mine" locale={locale} />
      <ActionNotice ok={sp.ok} error={sp.error} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          <p>{t("لم ترسل طلباً بعد.", "You have not sent a request yet.")}</p>
          <Link href="/invest" className="mt-2 inline-block font-bold text-primary underline">
            {t("تصفّح فرص الاستثمار", "Browse investment opportunities")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.interest_id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-black" {...arText}>
                  {r.land_name ? `${r.land_name} — ` : ""}
                  {[r.state, r.locality].filter(Boolean).join(" · ")}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone[r.status]}`}>
                  {lbl(INTEREST_STATUS_LABEL[r.status], locale)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {Number(r.feddans).toLocaleString("en-US")} {t("فدان", "feddans")} · {lbl(INVESTOR_MODEL_LABEL[r.model], locale)}
              </p>
              <p className="mt-2 whitespace-pre-line rounded-xl bg-background px-3 py-2 text-sm [overflow-wrap:anywhere]" {...arText}>
                {r.message}
              </p>

              {r.status === "accepted" && (
                <div className="mt-3 rounded-xl bg-leaf/5 p-3 text-sm ring-1 ring-leaf/20">
                  <p className="font-bold text-leaf">{t("قَبِل صاحب الأرض — تواصلا", "The owner accepted — get in touch")}</p>
                  <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted">{t("صاحب الأرض", "Owner")}</dt>
                      <dd className="font-medium" {...arText}>{r.owner_name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("الهاتف", "Phone")}</dt>
                      <dd className="font-medium">
                        {r.owner_phone ? (
                          <a href={`tel:${r.owner_phone}`} className="text-primary underline">
                            <bdi>{r.owner_phone}</bdi>
                          </a>
                        ) : (
                          t("لم يضف هاتفاً بعد", "No phone on file yet")
                        )}
                      </dd>
                    </div>
                    {r.village && (
                      <div>
                        <dt className="text-xs text-muted">{t("القرية", "Village")}</dt>
                        <dd className="font-medium" {...arText}>{r.village}</dd>
                      </div>
                    )}
                    {r.latitude !== null && r.longitude !== null && (
                      <div>
                        <dt className="text-xs text-muted">{t("الموقع", "Location")}</dt>
                        <dd>
                          <a
                            href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline"
                          >
                            {t("افتح الخريطة", "Open the map")}
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {t(
                      "عاينا الأرض، واتّفقا كتابةً على النسبة أو الأجرة والمدّة قبل أيّ دفع. وللإشراف والحرث والحصاد شركاتٌ شريكة موثّقة.",
                      "Inspect the land and agree the share or rent and the term in writing before any payment. Verified partner companies offer supervision, ploughing and harvest.",
                    )}{" "}
                    <Link href="/partners" className="font-bold text-primary underline">
                      {t("الشركات الشريكة", "Partner companies")}
                    </Link>
                  </p>
                  <form action={openAgreement} className="mt-3">
                    <input type="hidden" name="interest_id" value={r.interest_id} />
                    <input type="hidden" name="from" value="investor" />
                    <button className={button}>{t("اكتبا العقد ووقّعاه هنا", "Write and sign the agreement here")}</button>
                  </form>
                </div>
              )}

              {r.status === "pending" && (
                <form action={withdrawInvestorInterest} className="mt-3">
                  <input type="hidden" name="interest_id" value={r.interest_id} />
                  <button className={ghost}>{t("اسحب الطلب", "Withdraw the request")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
