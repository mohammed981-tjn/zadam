import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import { isNotDeployed, dateLabel } from "@/lib/supplyChain";
import {
  PARTNER_KINDS,
  PARTNER_KIND_LABEL,
  lbl,
  type PartnerAgreement,
  type PartnerCompany,
  type PartnerKind,
} from "@/lib/partners";
import PartnersShell from "@/components/partners/PartnersShell";
import AgreementGroups from "@/components/partners/AgreementGroups";
import { ComingSoon, button, card, field } from "@/components/supply/SupplyShell";
import { ContactButtons, StatesList, VerifiedBadge } from "@/components/supply/Explainers";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الشركات الزراعيّة الشريكة | سوداقري", "Partner farming companies | Sudagri"),
    description: tr(
      locale,
      "شركات ميكنةٍ وريٍّ ومدخلاتٍ وحصادٍ وتعبئةٍ ونقلٍ وإرشاد، رأت سوداقري سجلّها التجاري، وباتّفاقاتٍ مبدئيّةٍ تحدّد أيّ المزارع تخدم.",
      "Machinery, irrigation, input, harvest, packing, transport and extension companies whose commercial registration Sudagri has seen, with preliminary agreements naming the farms they serve.",
    ),
  };
}

/** The verified partner companies, filtered by what they offer and where. */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; state?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const kind = (PARTNER_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as PartnerKind) : null;
  const state = sp.state || null;

  const supabase = await createClient();
  const { data: cRows, error: cErr } = await supabase
    .from("partner_companies")
    .select(VISITOR_COLUMNS.partner_companies)
    .not("verified_at", "is", null)
    .eq("active", true)
    .order("name")
    .limit(500);
  const notDeployed = isNotDeployed(cErr);
  if (cErr && !notDeployed) console.error("partners: list failed", cErr);
  const companies = (cRows ?? []) as unknown as PartnerCompany[];

  let agreements: PartnerAgreement[] = [];
  if (companies.length > 0) {
    const { data: aRows, error: aErr } = await supabase
      .from("partner_agreements")
      .select("*")
      .eq("status", "active")
      .in(
        "company_id",
        companies.map((c) => c.id),
      )
      .order("valid_until");
    if (aErr) console.error("partners: agreements failed", aErr);
    agreements = (aRows ?? []) as PartnerAgreement[];
  }

  const shown = companies.filter((c) => (!kind || c.kinds.includes(kind)) && (!state || c.states.includes(state)));
  const usedStates = [...new Set(companies.flatMap((c) => c.states))];

  return (
    <PartnersShell active="/partners" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("الشركات الزراعيّة الشريكة", "Partner farming companies")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "هذه الشركات تنفّذ الخدمات الفعليّة على المزارع المسجّلة في سوداقري: الميكنة، والريّ، والمدخلات، والحصاد، والتعبئة، والنقل، والإرشاد. رأى المشرف سجلّها التجاري. ولكلٍّ منها اتّفاقٌ مبدئيٌّ يحدّد أيّ المزارع تخدم. والعقد الملزم لأيّ مزرعة هو عقد الخدمة نفسه: بمراحله، ودفعه بعد الإثبات.",
          "These companies carry out the field services on farms registered with Sudagri: machinery, irrigation, inputs, harvest, packing, transport and extension. An administrator has seen their commercial registration. Each has a preliminary agreement naming the farms it serves. The binding contract for any farm is the service contract itself: in stages, paid after proof.",
        )}
      </p>

      {!notDeployed && companies.length > 0 && (
        <form method="get" className={`${card} mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}>
          <label className="flex flex-col gap-1 text-sm">
            {t("ماذا تحتاج؟", "What do you need?")}
            <select name="kind" defaultValue={kind ?? ""} className={field}>
              <option value="">{t("كلّ الخدمات", "All services")}</option>
              {PARTNER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {lbl(PARTNER_KIND_LABEL[k], locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("ولايتك", "Your state")}
            <select name="state" defaultValue={state ?? ""} className={field}>
              <option value="">{t("كلّ الولايات", "All states")}</option>
              {usedStates.map((s) => (
                <option key={s} value={s}>
                  {stateName(s, locale)}
                </option>
              ))}
            </select>
          </label>
          <button className={button}>{t("اعرض", "Show")}</button>
        </form>
      )}

      <section className="mt-6" aria-live="polite">
        {notDeployed ? (
          <ComingSoon
            what={t(
              "نظام الشركات الشريكة بُني، وينتظر تفعيل قاعدة بياناته. فور تفعيلها تستطيع الشركات التسجيل وكتابة اتّفاقاتها، ويستطيع أصحاب الأراضي فتح أراضيهم لها.",
              "The partner-company system is built and waiting for its database to be switched on. As soon as it is, companies can register and write their agreements, and landowners can open their land to them.",
            )}
          />
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="font-bold">{t("لا شركة شريكة موثّقة هنا بعد.", "No verified partner company here yet.")}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {t(
                "إن كانت لك شركة ميكنةٍ أو ريٍّ أو حصادٍ أو تعبئة، فسجّلها، واكتب الاتّفاق المبدئيّ للمزارع التي تخدمها.",
                "If you run a machinery, irrigation, harvest or packing company, register it and write the preliminary agreement for the farms you serve.",
              )}
            </p>
            <Link href="/partners/mine" className={`${button} mt-4 inline-block`}>
              {t("سجّل شركتك", "Register your company")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {shown.map((c) => {
              const mine = agreements.filter((a) => a.company_id === c.id);
              return (
                <li key={c.id} className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold" {...(locale === "en" ? { lang: "ar", dir: "auto" } : {})}>
                      {c.name}
                    </h2>
                    <VerifiedBadge locale={locale} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {c.kinds.map((k) => lbl(PARTNER_KIND_LABEL[k], locale)).join(locale === "en" ? " · " : " · ")}
                  </p>
                  <p className="mt-1 text-sm">
                    {t("تعمل في:", "Works in:")} <StatesList states={c.states} locale={locale} />
                  </p>
                  {c.bio && (
                    <p className="mt-2 text-sm leading-7" {...(locale === "en" ? { lang: "ar", dir: "auto" } : {})}>
                      {c.bio}
                    </p>
                  )}
                  {mine.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3">
                      {mine.map((a) => (
                        <details key={a.id} className="rounded-xl border border-border px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium">
                            <bdi>{a.title}</bdi> —{" "}
                            <span className="text-muted">
                              {t(`حتى ${dateLabel(a.valid_until, locale)}`, `until ${dateLabel(a.valid_until, locale)}`)}
                            </span>
                          </summary>
                          <AgreementGroups a={a} locale={locale} />
                          <p className="mt-2 whitespace-pre-line text-sm leading-7" {...(locale === "en" ? { lang: "ar", dir: "auto" } : {})}>
                            {a.terms}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <ContactButtons supplier={c} locale={locale} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-bold">{t("كيف تصل الشركة إلى مزرعتك", "How a company reaches your farm")}</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-sm leading-7">
          <li>
            {t("تسجّل أرضك ويوثّقها المعاين، ثمّ تفتحها للشركات الشريكة من ", "You register your land and the inspector verifies it, then you open it to partner companies from ")}
            <Link href="/lands" className="text-primary underline">
              {t("صفحة أراضيك", "your land page")}
            </Link>
            .
          </li>
          <li>
            {t(
              "ترى الشركة المطابقة لمجموعة أرضك الولاية والمحليّة والمساحة والتربة والماء فقط، ولا ترى اسمك ولا موقع الأرض.",
              "A company matching your land’s group sees only the state, locality, area, soil and water — not your name or the land’s location.",
            )}
          </li>
          <li>
            {t(
              "إن أرادت خدمتها أرسلت لك طلباً. فإن قبلته رأت اسمك وهاتفك وموقع الأرض، وتواصلت معك.",
              "If it wants to serve it, it sends you a request. If you accept, it sees your name, phone and the land’s location, and contacts you.",
            )}
          </li>
          <li>
            {t("ثمّ يُكتب ", "Then a ")}
            <Link href="/contracts" className="text-primary underline">
              {t("عقد الخدمة", "service contract")}
            </Link>
            {t(" بمراحله قبل البذر، ولا يُدفع نصيب مرحلةٍ قبل إثباتها.", " is written in stages before sowing, and no stage is paid before it is proved.")}
          </li>
        </ol>
      </section>
    </PartnersShell>
  );
}
