import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { EmptyState } from "@/components/Explain";
import {
  announcementDate,
  type Announcement,
} from "@/lib/announcements";

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

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="لا خبر بعد">
            حين يُنشر أوّلُ خبر سيظهر هنا وفي أعلى الصفحة الرئيسيّة.
          </EmptyState>
        </div>
      ) : (
        <ol className="mt-8 flex flex-col gap-5">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <p className="text-xs text-muted">
                {announcementDate(a.published_at!)}
              </p>
              <h2 className="mt-1 text-lg font-bold">{a.title}</h2>

              {/* السطورُ محفوظة: مَن كتب فقرتين لم يكتب واحدة. */}
              <p className="mt-2 whitespace-pre-line text-sm leading-7">
                {a.body}
              </p>

              {a.link_path && (
                <Link
                  href={a.link_path}
                  className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
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
