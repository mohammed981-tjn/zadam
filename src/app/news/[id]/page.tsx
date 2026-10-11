import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { announcementDate, type Announcement } from "@/lib/announcements";
import { parseStudy } from "@/lib/studyDoc";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

// The same floor as the list; publishing an item revalidates both at once.
export const revalidate = 600;

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createPublicClient()
    .from("announcements")
    .select("id, title, body, summary, link_path, link_label, published_at")
    .eq("id", id)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  return data as Announcement | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const a = await load((await params).id);
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return a
    ? { title: `${a.title} | ${t("جديد سوداقري", "What's new on Sudagri")}` }
    : { title: t("خبر | سوداقري", "News | Sudagri") };
}

/**
 * خبرٌ واحد في صفحته — للطويل منها خاصّةً، كالدراسة التي نُشرت خبراً.
 *
 * Read with the anonymous client, so row-level security returns only what is
 * published and whose moment has come; a draft's id gives a 404, not a draft.
 */
export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await load((await params).id);
  if (!a) notFound();
  const doc = parseStudy(a.body, { titled: false });
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const arrow = en ? "→" : "←";
  // The item itself is stored in Arabic; on the English page it keeps its own direction.
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/news" className="hover:text-primary">
          {t("الأخبار", "News")}
        </Link>{" "}
        {arrow} <span {...arText}>{a.title}</span>
      </nav>
      <header className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {en
            ? new Date(a.published_at!).toLocaleDateString("en-GB", {
                timeZone: "Africa/Khartoum",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : announcementDate(a.published_at!)}
        </span>
        <h1 {...arText} className="mt-3 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
          {a.title}
        </h1>
        {a.summary && a.summary.trim() !== a.title.trim() && (
          <p {...arText} className="mt-2 font-medium leading-7 text-muted">{a.summary}</p>
        )}
        <ShareWhatsApp path={`/news/${a.id}`} text={`${a.title} — ${t("جديد سوداقري", "What's new on Sudagri")}:`} className="mt-4" locale={locale} />
      </header>

      {doc.sections.length > 2 && (
        <details className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card" open>
          <summary className="cursor-pointer font-bold">
            {en
              ? `Contents (${doc.sections.length} sections)`
              : `الفهرس (${doc.sections.length.toLocaleString("ar-SA")} قسماً)`}
          </summary>
          <ol {...arText} className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {s.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      <article {...arText} className="mt-8">
        <StudyBody blocks={doc.blocks} />
      </article>

      {a.link_path && (
        <Link
          href={a.link_path}
          className="mt-8 inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {a.link_label ?? t("التفاصيل", "Details")} {arrow}
        </Link>
      )}
      <p className="mt-10 text-sm">
        <Link href="/news" className="font-medium text-primary underline">
          {en ? "← All news" : "← كلّ الأخبار"}
        </Link>
      </p>
    </div>
  );
}
