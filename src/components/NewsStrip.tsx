import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import {
  announcementDate,
  type Announcement,
} from "@/lib/announcements";

/**
 * شريطُ الجديد في أعلى الرئيسيّة — ويختفي كلَّه حين لا خبر.
 *
 * WHY IT RENDERS NOTHING RATHER THAN AN EMPTY BOX
 *
 * The owner's requirement, in his words: «الرئيسية نفسها بس عندما اضيف خبر
 * يظهر في الأول وتظل كما هي». So the homepage is not redesigned around a news
 * section — the section does not exist until there is something in it. A
 * heading over an empty area would be a permanent reminder that nobody has
 * posted, which is worse than the page he already has.
 *
 * WHY THREE AND NOT ONE
 *
 * One is a banner and reads as an advertisement; a short list reads as a
 * platform that is moving. Three is what fits above the fold on a 390px phone
 * without pushing the rest of the homepage out of sight — and the rest of the
 * homepage is what the visitor came for.
 *
 * WHY THE SUMMARY AND NOT THE BODY
 *
 * The strip is an index, not the article. `/news` carries the full text, and a
 * paragraph here would turn the top of the homepage into a newsletter. When no
 * summary was written the title stands alone, deliberately: a machine-made
 * excerpt from the first line of the body reads as a sentence cut in half.
 */
export default async function NewsStrip() {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, summary, link_path, link_label, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(3);

  // فشلُ القراءة لا يكسر الرئيسيّة: الشريطُ إضافةٌ عليها لا جزءٌ منها.
  if (error) {
    console.error("news strip: read failed", error);
    return null;
  }

  const items = (data ?? []) as Pick<
    Announcement,
    "id" | "title" | "summary" | "link_path" | "link_label" | "published_at"
  >[];

  if (items.length === 0) return null;

  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-primary">جديد سودجري</h2>
          <Link href="/news" className="text-xs text-muted hover:text-primary">
            كل الأخبار ←
          </Link>
        </div>

        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id} className="border-r-2 border-primary/30 pr-3">
              <p className="text-[11px] text-muted">
                {announcementDate(a.published_at!)}
              </p>
              <p className="text-sm font-medium">{a.title}</p>
              {a.summary && (
                <p className="mt-0.5 text-xs leading-6 text-muted">
                  {a.summary}
                </p>
              )}
              {a.link_path && (
                <Link
                  href={a.link_path}
                  className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                >
                  {a.link_label} ←
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
