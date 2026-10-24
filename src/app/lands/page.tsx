import Link from "next/link";
import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import type { Land } from "@/types/database";
import LandDocuments from "@/components/LandDocuments";
import FilmPlayer from "@/components/FilmPlayer";
import LandPartnerConsent from "@/components/partners/LandPartnerConsent";
import LandInvestorConsent from "@/components/invest/LandInvestorConsent";
import LandCropFit from "@/components/LandCropFit";
import type { InspectionRow } from "@/lib/inspections";
import type { InvestorProfile, LandRequest } from "@/lib/investors";
import LandWater from "@/components/LandWater";
import { Suspense } from "react";
import type { PartnerCompany, PartnerInterest } from "@/lib/partners";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "أراضيّ | سوداقري", "My land | Sudagri") };
}

const VERIFICATION_LABEL: Record<Locale, Record<Land["verification"], string>> = {
  ar: {
    unverified: "غير محقّقة",
    submitted: "قيد المراجعة",
    verified: "محقّقة",
    rejected: "مرفوضة",
  },
  en: {
    unverified: "Not verified",
    submitted: "Under review",
    verified: "Verified",
    rejected: "Rejected",
  },
};

export default async function LandsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/lands"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const { data } = await supabase
    .from("lands")
    .select("*")
    .order("created_at", { ascending: false });

  const lands = (data ?? []) as Land[];

  const { data: docRows } = await supabase
    .from("land_documents")
    .select("id, land_id, kind, caption")
    .in("land_id", lands.length ? lands.map((l) => l.id) : ["0"]);

  const documents = (docRows ?? []) as {
    id: string;
    land_id: string;
    kind: string;
    caption: string | null;
  }[];

  // طلباتُ الشركات الشريكة على أراضيه. قبل هجرة الشركاء يعود الخطأ ولا شيء
  // يُعرض — وبطاقة الأرض تقول إنّ الخدمة قادمة.
  let interests: PartnerInterest[] = [];
  const companies = new Map<string, Pick<PartnerCompany, "id" | "name" | "kinds" | "phone">>();
  if (lands.length > 0) {
    const { data: iRows } = await supabase
      .from("partner_interests")
      .select("*")
      .eq("status", "pending")
      .in(
        "land_id",
        lands.map((l) => l.id),
      );
    interests = (iRows ?? []) as PartnerInterest[];
    if (interests.length > 0) {
      const { data: cRows } = await supabase
        .from("partner_companies")
        .select("id, name, kinds, phone")
        .in("id", [...new Set(interests.map((i) => i.company_id))]);
      for (const c of (cRows ?? []) as Pick<PartnerCompany, "id" | "name" | "kinds" | "phone">[]) companies.set(c.id, c);
    }
  }

  // طلباتُ المستثمرين على أراضيه (البند ١٢٤). قبل الهجرة يعود خطأ، فلا يُعرض شيء.
  let investorRequests: LandRequest[] = [];
  // وطلباتُ المعاينة على أرضه (البند ١٢٨).
  let inspections: InspectionRow[] = [];
  if (lands.some((l) => l.verification === "verified")) {
    const [{ data: rRows }, { data: iRows }, { data: pRows }] = await Promise.all([
      supabase.rpc("land_investor_requests"),
      supabase.rpc("land_inspection_list"),
      // من الذي يطلب (البند ١٣٦). قبل هجرته يعود خطأ، فيبقى الطلب كما كان.
      supabase.rpc("land_investor_profiles"),
    ]);
    const profiles = new Map(((pRows ?? []) as InvestorProfile[]).map((p) => [p.interest_id, p]));
    investorRequests = ((rRows ?? []) as LandRequest[]).map((r) => ({ ...r, profile: profiles.get(r.interest_id) }));
    inspections = ((iRows ?? []) as InspectionRow[]).filter((i) => i.role === "owner");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("أراضيّ", "My land")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              "أرضك المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً.",
              "Your registered land is the basis of every season and every opportunity you offer later.",
            )}
          </p>
        </div>
        <Link
          href="/lands/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("سجّل أرضاً", "Register land")}
        </Link>
      </div>

      {/* البند ١٥١: الجانب الآخر من الحساب نفسه. */}
      <p className="-mt-4 mb-8 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        {t("وتستثمر أيضاً بالحساب نفسه: ", "You can also invest with the same account: ")}
        <Link href="/invest" className="font-bold text-primary underline">
          {t("فرص الاستثمار — أراضٍ موثّقة تبحث عن شريك", "Investment opportunities — verified land looking for a partner")}
        </Link>
      </p>

      {sp.ok && (
        <p role="status" className="mb-6 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          {sp.ok}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {sp.error}
        </p>
      )}

      <figure className="my-6">
        <FilmPlayer base="/video/farmer-wide" poster="/video/farmer-wide.jpg" label={t("فيلم سوداقري: مزارعٌ من السودان", "A Sudagri film: a farmer from Sudan")} />
      </figure>

      {lands.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
          {t(
            "لم تسجّل أرضاً بعد. ابدأ بأرض واحدة — التسجيل مجاني ولا يظهر لأحد حتى تعتمده الإدارة.",
            "You have not registered any land yet. Start with one plot — registration is free, and no one sees it until the administrators approve it.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {lands.map((l) => {
            const station = stationName(l.station_key, locale);
            return (
              <li
                key={l.id}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold" {...arText}>
                      {l.name}
                    </h2>
                    <p className="text-sm text-muted">
                      <span {...arText}>
                        {l.state}
                        {l.locality ? ` · ${l.locality}` : ""}
                      </span>{" "}
                      · {l.feddans} {t("فدان", "feddans")} · {station}
                    </p>
                  </div>
                  <div className="text-end">
                    <span
                      className={`text-xs font-medium ${
                        l.verification === "verified"
                          ? "text-primary"
                          : l.verification === "rejected"
                            ? "text-danger"
                            : "text-accent"
                      }`}
                    >
                      {VERIFICATION_LABEL[locale][l.verification]}
                    </span>
                    {/* The counter counts kinds, and four kinds can be on file
                        against three required — «4/3» read as a mistake
                        (backlog 123). */}
                    <p className="text-xs text-muted">
                      {l.documents_on_file >= l.documents_required
                        ? t("المستندات مكتملة ✓", "Documents complete ✓")
                        : t(
                            `المستندات: ${l.documents_on_file} من ${l.documents_required}`,
                            `Documents: ${l.documents_on_file} of ${l.documents_required}`,
                          )}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {[
                    [
                      t("مصدر المياه", "Water source"),
                      waterSourceLabel(l.water_source, locale),
                    ],
                    [
                      t("المياه للفدان", "Water per feddan"),
                      l.water_per_feddan
                        ? `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} ${t("م³", "m³")}`
                        : "—",
                    ],
                    [t("التربة", "Soil"), l.soil_note ?? "—", true],
                    [t("زُرع سابقاً", "Previously grown"), l.previous_crops ?? "—", true],
                  ].map(([k, v, userText]) => (
                    <div key={String(k)}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="font-medium" {...(userText ? arText : {})}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>

                {l.latitude !== null && l.longitude !== null ? (
                  <Suspense
                    fallback={
                      <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted">
                        {t("يُقرأ ماء أرضك من أقمار الفاو…", "Reading your land's water from FAO's satellites…")}
                      </p>
                    }
                  >
                    <LandWater lat={Number(l.latitude)} lng={Number(l.longitude)} feddans={Number(l.feddans)} locale={locale} />
                  </Suspense>
                ) : (
                  <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted">
                    {t(
                      "أضف خطّ العرض والطول لهذه الأرض (عدّل الأرض) لترى ماءها من أقمار الفاو كلّ عشرة أيّام.",
                      "Add this land's latitude and longitude (edit the land) to see its water from FAO's satellites every ten days.",
                    )}
                  </p>
                )}

                <LandDocuments
                  landId={l.id}
                  existing={documents.filter((d) => d.land_id === l.id)}
                />

                {/* «اعرض أرضك» (backlogs 123, 129): one heading over the three
                    ways a verified land reaches others — investors, partner
                    companies, a project with shares — instead of three
                    separate boxes scattered down the card. */}
                {l.verification === "verified" && l.listed && (
                  <div className="mt-4 rounded-xl bg-primary/5 p-3 text-sm ring-1 ring-primary/15">
                    <p className="font-bold text-primary">{t("اعرض أرضك", "Offer your land")}</p>
                    <ol className="mt-1 flex list-inside list-decimal flex-col gap-1 text-xs leading-6 text-muted">
                      <li>
                        {t(
                          "للمستثمرين — من قسم «المستثمرون» أدناه: تظهر في المشاريع وفرص الاستثمار بلا اسمك ولا موقعها حتى توافق.",
                          "To investors — in «Investors» below: it shows in projects and investment opportunities without your name or its location until you agree.",
                        )}
                      </li>
                      <li>
                        {t(
                          "للشركات الشريكة — من قسمها أدناه: تعرض عليك الشركة المطابقة حرثاً أو ريّاً أو حصاداً أو إشرافاً.",
                          "To partner companies — in their section below: a matching company offers you ploughing, irrigation, harvest or supervision.",
                        )}
                      </li>
                      <li>
                        {t(
                          "مشروعٌ بالمحصول والحصص باسمك — تُفتح استمارته مملوءةً من أرضك، ويحمل بعد نشره شارة «على أرضٍ موثّقة».",
                          "A project with a crop and shares under your name — its form opens filled in from your land, and once published it carries the «On verified land» badge.",
                        )}
                      </li>
                    </ol>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/opportunities/new?land=${l.id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
                        {t("اكتب مشروعاً على هذه الأرض", "Write a project on this land")}
                      </Link>
                      <Link href={`/seasons/new?land=${l.id}`} className="rounded-lg px-3 py-1.5 text-xs font-bold text-leaf ring-1 ring-leaf/30 hover:bg-leaf/10">
                        {t("ابدأ موسماً على هذه الأرض", "Start a season on this land")}
                      </Link>
                      <Link href={`/farmers/${l.owner_id}`} className="rounded-lg px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/30 hover:bg-primary/10">
                        {t("صفحتي العامّة", "My public page")}
                      </Link>
                    </div>
                  </div>
                )}

                {/* البند ١٥٢: الغنيمة الأولى من كنوز — بقواعد تُقرأ ومصادر. */}
                <LandCropFit land={l} locale={locale} />

                <LandInvestorConsent
                  land={l}
                  requests={investorRequests.filter((r) => r.land_id === l.id)}
                  inspections={inspections.filter((i) => i.land_id === l.id)}
                  locale={locale}
                />

                <LandPartnerConsent
                  land={l}
                  interests={interests.filter((i) => i.land_id === l.id)}
                  companies={companies}
                  locale={locale}
                />

                {l.verification_note && (
                  <p
                    className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted"
                    {...arText}
                  >
                    {l.verification_note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
