import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { EmptyState } from "@/components/Explain";
import {
  announcementDate,
  type Announcement,
} from "@/lib/announcements";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { parseStudy, plainExcerpt } from "@/lib/studyDoc";

/**
 * A long item — a study pasted in as news — is shown here as its opening
 * lines and a link to its own page, so one item does not bury the rest of
 * the list under thirty thousand characters. A short one is shown whole.
 */
const LONG = 1200;

export const metadata = {
  title: "أخبار سودجري | جديد المنصّة",
  description:
    "ما استجدّ في سودجري: بيانات أُضيفت، دراسات نُشرت، وأدوات صارت متاحة.",
};

/*
 * عشرُ دقائق بين البناء والبناء — لا ساعة.
 *
 * Shorter than `/knowledge` on purpose. A reference library that lags an hour
 * has lagged nothing; a page called «جديد» that lags an hour is a page whose
 * name is not true. And publishing invalidates it immediately anyway — this is
 * only the floor for a scheduled post whose moment arrives with nobody writing.
 */
export const revalidate = 600;

/**
 * جديدُ المنصّة — والصفحةُ عامّةٌ بلا حساب.
 *
 * WHY IT READS WITH THE ANONYMOUS CLIENT
 *
 * The page is the same for every reader, so it is built once and cached. That
 * is only safe because the client carries no session: row-level security
 * applies to it exactly as to a logged-out visitor, and
 * `announcements_public_read` returns only what is published and whose moment
 * has come. A cached page can therefore never carry a draft, no matter who
 * happened to trigger the build.
 */
export default async function NewsPage() {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, summary, link_path, link_label, published_at, created_at, updated_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) console.error("news: read failed", error);

  const items = (data ?? []) as Announcement[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">جديد سودجري</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        ما استجدّ في المنصّة: بياناتٌ أُضيفت، ودراساتٌ نُشرت، وأدواتٌ صارت
        متاحة. والأقدمُ يبقى — فالصفحةُ سجلٌّ لا واجهةُ عرض.
      </p>
      <ShareWhatsApp path="/news" text="جديد سودجري:" className="my-3" />

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="لا خبر بعد">
            حين يُنشر أوّلُ خبر سيظهر هنا، وتفتحه من القائمة ومن تبويب «الأخبار»
            في الرئيسيّة.
          </EmptyState>
        </div>
      ) : (
        /*
         * أحدثُ خبرٍ بطاقةٌ بارزة، وما قبله خطٌّ زمنيّ بتاريخٍ على كلٍّ منه —
         * طلب المالك (25 سبتمبر) أن تكون الأخبار واضحةً في صفحتها.
         */
        <ol className="mt-8 flex flex-col gap-6">
          {items.map((a, i) => (
            <li
              key={a.id}
              className={
                i === 0
                  ? "rounded-2xl border-2 border-primary/50 bg-card p-6 shadow-raised"
                  : "relative border-r-2 border-border pr-5"
              }
            >
              {i > 0 && (
                <span aria-hidden className="absolute -right-[7px] top-1.5 size-3 rounded-full border-2 border-card bg-primary" />
              )}
              <p className="flex flex-wrap items-center gap-2 text-xs">
                {i === 0 && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 font-bold text-primary-foreground">
                    الأحدث
                  </span>
                )}
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  {announcementDate(a.published_at!)}
                </span>
              </p>
              <h2 className={`mt-2 font-black leading-snug ${i === 0 ? "text-2xl" : "text-lg"}`}>
                {a.title}
              </h2>
              {/* A summary that only repeats the title says nothing; it is left out. */}
              {a.summary && a.summary.trim() !== a.title.trim() && (
                <p className="mt-1 text-sm font-medium leading-7 text-muted">{a.summary}</p>
              )}

              {/* The body is drawn from its Markdown — headings, lists and
                  formulas as such, not as `#` and `-` in a paragraph. */}
              {a.body.length > LONG ? (
                <>
                  <p className="mt-3 text-sm leading-8">{plainExcerpt(a.body)}</p>
                  <Link
                    href={`/news/${a.id}`}
                    className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    اقرأ الخبر كاملاً ←
                  </Link>
                </>
              ) : (
                <div className="text-sm">
                  <StudyBody blocks={parseStudy(a.body, { titled: false }).blocks} />
                </div>
              )}

              {a.link_path && (
                <Link
                  href={a.link_path}
                  className="mt-4 inline-flex items-center gap-1 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
                >
                  {a.link_label} ←
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
