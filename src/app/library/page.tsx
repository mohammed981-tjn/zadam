import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import { RESEARCH_KINDS, RESEARCH_KIND_LABEL } from "@/lib/research";
import { listPublishedResearch, researchFilter } from "@/lib/researchLibrary";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "مكتبة الدراسات والبحوث | سوداقري", "Studies and research library | Sudagri"),
    description: tr(
      locale,
      "دراسات جدوى وبحوث ورسائل جامعيّة وتقارير عن الزراعة في السودان، يرسلها الباحثون والمزارعون والزوّار وتراجعها سوداقري قبل نشرها.",
      "Feasibility studies, research, theses and reports on farming in Sudan, sent by researchers, farmers and visitors and reviewed by Sudagri before publication.",
    ),
  };
}

/**
 * مكتبة الدراسات والبحوث (البند ٢٠٢): ما نُشر، بفرزٍ حسب النوع وبحثٍ في العنوان والملخّص والمحصول، وزرّ «شارك دراستك».
 * The table answers only what is published, whoever asks; the page asks for the public columns by name.
 */
export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const sp = await searchParams;
  const { kind, q } = researchFilter(sp.kind, sp.q);

  // The same read as the phone app's /api/app/library (lib/researchLibrary.ts).
  const { items, error } = await listPublishedResearch(await createClient(), { kind, q });
  if (error) console.error("library: list failed", error);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader icon="book" eyebrow={t("المعرفة", "Knowledge")} title={t("مكتبة الدراسات والبحوث", "Studies and research library")}>
        {t(
          "دراسات جدوى وبحوثٌ ورسائل جامعيّة وتقارير عن الزراعة في السودان، يرسلها الباحثون والمزارعون والزوّار، وتراجعها سوداقري قبل نشرها. كلُّ عملٍ هنا يبني على ما قبله، فتصير المكتبة ذاكرةً للزراعة السودانيّة يرجع إليها من يأتي بعدنا.",
          "Feasibility studies, research, theses and reports on farming in Sudan, sent by researchers, farmers and visitors, and reviewed by Sudagri before publication. Each work builds on those before it, so the library becomes a memory of Sudanese farming for those who come after us.",
        )}
      </PageHeader>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/library/new"
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card transition hover:opacity-90"
        >
          {t("شارك دراستك أو بحثك", "Share your study or research")}
        </Link>
        <Link href="/library/mine" className="text-sm text-primary underline">
          {t("ما أرسلتُه", "What I sent")}
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap gap-2" action="/library">
        <input
          name="q"
          defaultValue={q}
          placeholder={t("ابحث: السمسم، الريّ، القضارف…", "Search: sesame, irrigation, Gedaref…")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <select name="kind" defaultValue={kind ?? ""} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <option value="">{t("كلّ الأنواع", "Every kind")}</option>
          {RESEARCH_KINDS.map((k) => (
            <option key={k} value={k}>
              {tr(locale, ...RESEARCH_KIND_LABEL[k])}
            </option>
          ))}
        </select>
        <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold">{t("ابحث", "Search")}</button>
      </form>

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="font-bold">
            {q || kind ? t("لا عمل يطابق بحثك بعد.", "Nothing matches your search yet.") : t("المكتبة تنتظر أوّل عمل.", "The library is waiting for its first work.")}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t(
              "عندك دراسة جدوى أو بحثٌ أو رسالةٌ جامعيّة عن الزراعة في السودان؟ أرسلها، فتراجعها الإدارة وتنشرها باسمك.",
              "Have a feasibility study, research or thesis on farming in Sudan? Send it; the team reviews it and publishes it under your name.",
            )}
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/library/${r.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-float"
              >
                <span className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                    {tr(locale, ...RESEARCH_KIND_LABEL[r.kind])}
                  </span>
                  {r.crop && <span className="rounded-full bg-background px-2.5 py-0.5 text-muted">{r.crop}</span>}
                  {r.state && <span className="rounded-full bg-background px-2.5 py-0.5 text-muted">{r.state}</span>}
                </span>
                <span className="text-lg font-black leading-snug">{r.title}</span>
                <span className="text-sm text-muted">
                  {r.authors}
                  {r.institution && ` · ${r.institution}`}
                  {r.year && ` · ${r.year}`}
                </span>
                <span className="line-clamp-3 text-sm leading-7">{r.abstract}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
