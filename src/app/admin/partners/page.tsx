import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { dateLabel, isNotDeployed } from "@/lib/supplyChain";
import {
  AGREEMENT_STATUS,
  PARTNER_KIND_LABEL,
  lbl,
  type PartnerAgreement,
  type PartnerCompany,
} from "@/lib/partners";
import AgreementGroups from "@/components/partners/AgreementGroups";
import { ComingSoon, button, card, field, ghost } from "@/components/supply/SupplyShell";
import { StatesList, VerifiedBadge } from "@/components/supply/Explainers";
import { activateAgreement, endAgreementAdmin, reviewPartner, setPartnerActiveAdmin } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مراجعة الشركات الشريكة | سوداقري", "Partner company review | Sudagri") };
}

/**
 * Where a partner company is verified and its preliminary agreements are
 * switched on. An agreement is read here before it starts showing farms to a
 * company, so it is shown in full — every dimension of the group and the terms.
 */
export default async function AdminPartnersPage({
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
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const [{ data: cRows, error: cErr }, { data: aRows }] = await Promise.all([
    supabase.from("partner_companies").select("*").order("created_at"),
    supabase.from("partner_agreements").select("*").order("created_at", { ascending: false }).limit(300),
  ]);
  const notDeployed = isNotDeployed(cErr);
  if (cErr && !notDeployed) console.error("admin/partners: list failed", cErr);
  const companies = (cRows ?? []) as PartnerCompany[];
  const agreements = (aRows ?? []) as PartnerAgreement[];
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));

  const pending = companies.filter((c) => !c.verified_at);
  const verified = companies.filter((c) => c.verified_at);
  const drafts = agreements.filter((a) => a.status === "draft");
  const active = agreements.filter((a) => a.status === "active");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href="/admin" className="text-primary underline">
          {t("→ لوحة الإدارة", "← Admin")}
        </Link>
        {" · "}
        <Link href="/admin/land-groups" className="text-primary underline">
          {t("فهرس مجموعات المزارع", "Farm groups index")}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{t("الشركات الشريكة واتّفاقاتها", "Partner companies and their agreements")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t(
          "وثّق الشركة بعد أن ترى سجلّها التجاري. ثمّ اقرأ مسوّدة اتّفاقها: المجموعة التي تخدمها، والخدمات، والشروط. فإذا فعّلته ظهرت للشركة المزارع المطابقة التي فتحها أصحابها، بلا اسمٍ ولا موقع.",
          "Verify a company once you have seen its commercial registration. Then read its draft agreement: the group it serves, the services, the terms. Once you activate it, the company sees the matching farms their owners opened — without names or locations.",
        )}
      </p>

      {sp.ok && <p role="status" className="mt-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">{sp.error}</p>}

      {notDeployed ? (
        <div className="mt-6">
          <ComingSoon />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-bold">{t(`بانتظار التوثيق (${pending.length})`, `Awaiting verification (${pending.length})`)}</h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("لا شيء.", "Nothing.")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {pending.map((c) => (
                  <CompanyCard key={c.id} c={c} locale={locale} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold">{t(`مسوّدات الاتّفاقات (${drafts.length})`, `Draft agreements (${drafts.length})`)}</h2>
            {drafts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("لا شيء.", "Nothing.")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {drafts.map((a) => (
                  <AgreementCard key={a.id} a={a} company={nameOf.get(a.company_id) ?? "—"} locale={locale} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold">{t(`الاتّفاقات المفعّلة (${active.length})`, `Active agreements (${active.length})`)}</h2>
            {active.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("لا شيء.", "Nothing.")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {active.map((a) => (
                  <AgreementCard key={a.id} a={a} company={nameOf.get(a.company_id) ?? "—"} locale={locale} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold">{t(`الشركات الموثّقة (${verified.length})`, `Verified companies (${verified.length})`)}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {verified.map((c) => (
                <CompanyCard key={c.id} c={c} locale={locale} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function CompanyCard({ c, locale }: { c: PartnerCompany; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <li className={`${card} ${c.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          <bdi>{c.name}</bdi>
        </p>
        {c.verified_at && <VerifiedBadge locale={locale} />}
      </div>
      <p className="mt-1 text-sm text-muted">{c.kinds.map((k) => lbl(PARTNER_KIND_LABEL[k], locale)).join(" · ")}</p>
      <p className="mt-1 text-sm">
        <StatesList states={c.states} locale={locale} />
      </p>
      <p className="mt-1 text-sm">
        {t("السجلّ التجاري:", "Commercial reg.:")} <bdi className="figure">{c.commercial_registration_no ?? "—"}</bdi>
        {" · "}
        <bdi>{c.contact_name}</bdi> · <bdi className="figure">{c.phone}</bdi>
      </p>
      {c.bio && <p className="mt-1 text-sm text-muted"><bdi>{c.bio}</bdi></p>}
      {c.review_note && <p className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-muted">{c.review_note}</p>}
      <form action={reviewPartner} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="company_id" value={c.id} />
        <input name="note" maxLength={500} className={field} placeholder={t("ملاحظة (سبب الردّ إلزاميّ)", "Note (required to return)")} aria-label={t("ملاحظة", "Note")} />
        {!c.verified_at && (
          <button name="verify" value="true" className={button}>
            {t("وثّق", "Verify")}
          </button>
        )}
        <button name="verify" value="false" className={ghost}>
          {c.verified_at ? t("اسحب التوثيق", "Withdraw the badge") : t("رُدّ بالسبب", "Return with reason")}
        </button>
      </form>
      <form action={setPartnerActiveAdmin} className="mt-2">
        <input type="hidden" name="company_id" value={c.id} />
        <input type="hidden" name="active" value={c.active ? "false" : "true"} />
        <button className="text-xs text-muted underline">{c.active ? t("أوقف مؤقّتاً", "Pause") : t("أعد التفعيل", "Reactivate")}</button>
      </form>
    </li>
  );
}

function AgreementCard({ a, company, locale }: { a: PartnerAgreement; company: string; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <li className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          <bdi>{a.title}</bdi> — <bdi className="font-normal">{company}</bdi>
        </p>
        <span className="text-xs text-muted">{lbl(AGREEMENT_STATUS[a.status], locale)}</span>
      </div>
      <p className="text-xs text-muted">
        {dateLabel(a.valid_from, locale)} — {dateLabel(a.valid_until, locale)}
      </p>
      <AgreementGroups a={a} locale={locale} />
      <p className="mt-2 whitespace-pre-line text-sm leading-7">
        <bdi>{a.terms}</bdi>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status === "draft" && (
          <form action={activateAgreement}>
            <input type="hidden" name="agreement_id" value={a.id} />
            <button className={button}>{t("فعّل الاتّفاق", "Activate")}</button>
          </form>
        )}
        <form action={endAgreementAdmin}>
          <input type="hidden" name="agreement_id" value={a.id} />
          <button className={ghost}>{a.status === "draft" ? t("ارفض المسوّدة", "Reject the draft") : t("أنهِ الاتّفاق", "End")}</button>
        </form>
      </div>
    </li>
  );
}
