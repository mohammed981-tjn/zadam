import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { parseStudy } from "@/lib/studyDoc";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { COMPOST_CAVEAT, COMPOST_NOTE } from "@/lib/studiesIndex";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "دراسة جدوى مصنع السماد العضوي (الكمبوست) — السودان | سوداقري",
      "Feasibility study: an organic compost factory in Sudan | Sudagri",
    ),
    description: tr(
      locale,
      "مصنع كمبوست هوائي بطاقة 20 طن/يوم على مرحلتين: السوق والموقع والمواد الخام والمعدات والتكاليف والإيرادات والعائد والمخاطر والتراخيص والتسويق والجدول الزمني.",
      "A 20-tonne-a-day windrow compost factory built in two phases: the market, site, raw materials, equipment, costs, revenue, returns, risks, licences, marketing and timeline. The study is in Arabic.",
    ),
  };
}

/**
 * دراسة جدوى مصنع الكمبوست (المالك، 9 نوفمبر 2026: «ضيف الدراسة التالية في الموقع بعدما تراجعها وترتّبها وتختصرها»).
 *
 * The owner's study of 8 November 2026, in eighteen sections, reviewed and condensed to twelve in
 * content/studies/compost-ar.md. Its arithmetic was checked line by line — capital, operating costs, revenue,
 * break-even, depreciation, the five-year cash flow, NPV at 20% and IRR all reconcile with the study's own figures.
 * What changed in the condensing is said at the top: the references to charts that were not sent, the detail of
 * which force holds which state (now one neutral line), a shop's name, and one wage claim that the table did not
 * bear out.
 */
export default async function CompostStudy() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const arabic = en ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const md = readFileSync(join(process.cwd(), "content/studies/compost-ar.md"), "utf8");
  const doc = parseStudy(md);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/studies" className="hover:text-primary">
          {t("الدراسات", "Studies")}
        </Link>{" "}
        {t("← مصنع السماد العضوي", "→ The compost factory")}
      </nav>

      <header className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        {en && (
          <h1 className="mb-4 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
            Feasibility study: an organic compost factory in Sudan
          </h1>
        )}
        <div {...arabic}>
          {en ? (
            <p className="text-xl font-black leading-snug">{doc.title[0]}</p>
          ) : (
            <h1 className="font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
              {doc.title[0]}
            </h1>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">{t(COMPOST_NOTE.ar, COMPOST_NOTE.en)}</p>
        <ShareWhatsApp
          path="/studies/compost"
          text={t(
            "دراسة جدوى مصنع سماد عضوي (كمبوست) في السودان، على مرحلتين:",
            "A feasibility study for an organic compost factory in Sudan, in two phases:",
          )}
          locale={locale}
          className="mt-4"
        />
      </header>

      <aside className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-7">
        {en ? COMPOST_CAVEAT.en : COMPOST_CAVEAT.ar}
      </aside>

      <details className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card" open>
        <summary className="cursor-pointer font-bold">
          {en
            ? `Contents (${doc.sections.length} sections)`
            : `فهرس الدراسة (${doc.sections.length.toLocaleString("ar-SA")} قسماً)`}
        </summary>
        <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2" {...arabic}>
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <article className="mt-8" {...arabic}>
        <StudyBody blocks={doc.blocks} />
      </article>

      <p className="mt-10 text-sm">
        <Link href="/studies" className="font-medium text-primary underline">
          {t("← كلّ الدراسات", "← All studies")}
        </Link>
      </p>
    </div>
  );
}
