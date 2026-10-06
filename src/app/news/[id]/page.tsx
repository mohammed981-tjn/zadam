import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { announcementDate, type Announcement } from "@/lib/announcements";
import { parseStudy } from "@/lib/studyDoc";

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
  return a ? { title: `${a.title} | جديد سوداقري` } : { title: "خبر | سوداقري" };
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/news" className="hover:text-primary">
          الأخبار
        </Link>{" "}
        ← {a.title}
      </nav>
      <header className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {announcementDate(a.published_at!)}
        </span>
        <h1 className="mt-3 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
          {a.title}
        </h1>
        {a.summary && a.summary.trim() !== a.title.trim() && (
          <p className="mt-2 font-medium leading-7 text-muted">{a.summary}</p>
        )}
        <ShareWhatsApp path={`/news/${a.id}`} text={`${a.title} — جديد سوداقري:`} className="mt-4" />
      </header>

      {doc.sections.length > 2 && (
        <details className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card" open>
          <summary className="cursor-pointer font-bold">
            الفهرس ({doc.sections.length.toLocaleString("ar-SA")} قسماً)
          </summary>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
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

      <article className="mt-8">
        <StudyBody blocks={doc.blocks} />
      </article>

      {a.link_path && (
        <Link
          href={a.link_path}
          className="mt-8 inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {a.link_label ?? "التفاصيل"} ←
        </Link>
      )}
      <p className="mt-10 text-sm">
        <Link href="/news" className="font-medium text-primary underline">
          ← كلّ الأخبار
        </Link>
      </p>
    </div>
  );
}
