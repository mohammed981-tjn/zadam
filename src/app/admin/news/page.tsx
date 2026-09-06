import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  announcementDate,
  type Announcement,
} from "@/lib/announcements";
import {
  saveAnnouncement,
  setAnnouncementPublished,
  deleteAnnouncement,
} from "./actions";

export const metadata = { title: "الأخبار | إدارة سودجري" };

/**
 * شاشةُ الأخبار — الكتابةُ أوّلاً ثمّ السجلّ.
 *
 * WHY THE FORM IS AT THE TOP AND ALWAYS OPEN
 *
 * The owner works from a phone. A «خبر جديد» button that reveals a form is one
 * more tap and one more thing to find, and this screen has exactly one purpose.
 * So the form is the screen, and the list is what has been written.
 *
 * WHY A DRAFT IS SAVED WITHOUT PUBLISHING
 *
 * Writing on a phone gets interrupted. Saving and publishing being one button
 * means a half-written notice is either lost or public, and both are bad. The
 * draft is free, the publish is a second, separate act, and the list shows the
 * two states differently so nothing is public by accident.
 */
export default async function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data: rows } = await supabase
    .from("announcements")
    .select("id, title, body, summary, link_path, link_label, published_at, created_at, updated_at")
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  const items = (rows ?? []) as Announcement[];
  const drafts = items.filter((a) => !a.published_at);
  const live = items.filter((a) => a.published_at);

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">أخبار المنصّة</h1>
        <Link href="/news" className="text-sm text-primary hover:underline">
          اعرض الصفحة العامّة ←
        </Link>
      </div>
      <p className="mt-2 text-sm leading-7 text-muted">
        ما تنشره هنا يظهر في <strong>أعلى الصفحة الرئيسيّة</strong> (أحدثُ ثلاثة)
        وفي <code className="text-xs">/news</code> كاملاً. والمسوّدةُ لا يراها
        أحدٌ حتّى تنشرها.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        action={saveAnnouncement}
        className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <label className="text-xs">
          <span className="mb-1 block text-muted">العنوان</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={200}
            placeholder="مثال: أُضيفت أسعار المنتِج من FAOSTAT لعام ٢٠٢٥"
            className={field}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-muted">
            سطرٌ مختصر — يظهر في الرئيسيّة تحت العنوان (اختياريّ)
          </span>
          <input
            name="summary"
            minLength={10}
            maxLength={300}
            className={field}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-muted">النصّ</span>
          <textarea
            name="body"
            required
            minLength={20}
            rows={6}
            placeholder="ما الذي تغيّر، ولماذا يهمّ المزارع أو المستثمر."
            className={field}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted">
              رابطٌ داخل المنصّة (اختياريّ)
            </span>
            <input
              name="link_path"
              placeholder="/knowledge"
              pattern="^/[A-Za-z0-9/_-]*$"
              className={field}
              dir="ltr"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">اسمُ الرابط</span>
            <input
              name="link_label"
              maxLength={40}
              placeholder="تصفّح قاعدة المعرفة"
              className={field}
            />
          </label>
        </div>

        <button
          type="submit"
          className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          احفظ مسوّدة
        </button>
        {/* ولا يُنشر من هنا: الحفظُ فعلٌ والنشرُ فعلٌ آخر، وخبرٌ يُنشر بضغطةٍ
            واحدةٍ مع كتابته يُنشر ناقصاً يوماً ما. */}
      </form>

      {drafts.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-bold text-muted">
            مسوّدات ({drafts.length}) — لا يراها أحد
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {drafts.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-dashed border-border bg-card p-4"
              >
                <p className="font-medium">{a.title}</p>
                <p className="mt-1 whitespace-pre-line text-xs leading-6 text-muted">
                  {a.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={setAnnouncementPublished}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="publish" value="1" />
                    <button className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground">
                      انشرها الآن
                    </button>
                  </form>
                  <form action={deleteAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-lg border border-danger/40 px-4 py-1.5 text-xs text-danger">
                      احذف المسوّدة
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 text-sm font-bold text-muted">
        منشورة ({live.length})
      </h2>
      {live.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          لا خبرَ منشورٌ بعد — والرئيسيّةُ تبقى كما هي حتّى تنشر أوّلَه.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {live.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <p className="text-xs text-muted">
                نُشر {announcementDate(a.published_at!)}
              </p>
              <p className="mt-1 font-medium">{a.title}</p>
              <form action={setAnnouncementPublished} className="mt-3">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="publish" value="0" />
                <button className="rounded-lg border border-border px-4 py-1.5 text-xs">
                  اسحبها من النشر
                </button>
              </form>
              {/* ولا زرَّ حذفٍ هنا: خبرٌ قرأه الناس يُسحب ولا يُمحى، والقاعدةُ
                  ترفض الحذفَ على المنشور لا الشاشةُ وحدها. */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
