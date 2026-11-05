import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import {
  announcementDate,
  type Announcement,
} from "@/lib/announcements";
import {
  saveAnnouncement,
  setAnnouncementPublished,
  deleteAnnouncement,
} from "./actions";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export const metadata = { title: "الأخبار | إدارة سوداقري" };

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
  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const publishedOn = (iso: string) =>
    locale === "en"
      ? new Date(iso).toLocaleDateString("en-GB", {
          timeZone: "Africa/Khartoum",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : announcementDate(iso);

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
        <h1 className="text-2xl font-bold">{t("أخبار المنصّة", "Platform news")}</h1>
        <Link href="/news" className="text-sm text-primary hover:underline">
          {t("اعرض الصفحة العامّة ←", "View the public page →")}
        </Link>
      </div>
      <p className="mt-2 text-sm leading-7 text-muted">
        {locale === "en" ? (
          <>
            What you publish here appears at the <strong>top of the home page</strong> (the latest three) and in full at{" "}
            <code className="text-xs">/news</code>. No one sees a draft until you publish it.
          </>
        ) : (
          <>
            ما تنشره هنا يظهر في <strong>أعلى الصفحة الرئيسيّة</strong> (أحدثُ ثلاثة)
            وفي <code className="text-xs">/news</code> كاملاً. والمسوّدةُ لا يراها
            أحدٌ حتّى تنشرها.
          </>
        )}
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
          <span className="mb-1 block text-muted">{t("العنوان", "Title")}</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={200}
            placeholder={t("مثال: أُضيفت أسعار المنتِج من FAOSTAT لعام ٢٠٢٥", "Example: FAOSTAT producer prices for 2025 added")}
            className={field}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-muted">
            {t("سطرٌ مختصر — يظهر في الرئيسيّة تحت العنوان (اختياريّ)", "Short summary — shown on the home page under the title (optional)")}
          </span>
          <input
            name="summary"
            minLength={10}
            maxLength={300}
            className={field}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-muted">{t("النصّ", "Text")}</span>
          <textarea
            name="body"
            required
            minLength={20}
            rows={6}
            placeholder={t("ما الذي تغيّر، ولماذا يهمّ المزارع أو المستثمر.", "What changed, and why it matters to farmers or investors.")}
            className={field}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted">
              {t("رابطٌ داخل المنصّة (اختياريّ)", "Link within the platform (optional)")}
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
            <span className="mb-1 block text-muted">{t("اسمُ الرابط", "Link label")}</span>
            <input
              name="link_label"
              maxLength={40}
              placeholder={t("تصفّح قاعدة المعرفة", "Browse the knowledge base")}
              className={field}
            />
          </label>
        </div>

        <button
          type="submit"
          className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("احفظ مسوّدة", "Save draft")}
        </button>
        {/* ولا يُنشر من هنا: الحفظُ فعلٌ والنشرُ فعلٌ آخر، وخبرٌ يُنشر بضغطةٍ
            واحدةٍ مع كتابته يُنشر ناقصاً يوماً ما. */}
      </form>

      {drafts.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-bold text-muted">
            {t(`مسوّدات (${drafts.length}) — لا يراها أحد`, `Drafts (${drafts.length}) — no one sees these`)}
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
                      {t("انشرها الآن", "Publish now")}
                    </button>
                  </form>
                  <form action={deleteAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-lg border border-danger/40 px-4 py-1.5 text-xs text-danger">
                      {t("احذف المسوّدة", "Delete draft")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 text-sm font-bold text-muted">
        {t("منشورة", "Published")} ({live.length})
      </h2>
      {live.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {t(
            "لا خبرَ منشورٌ بعد — والرئيسيّةُ تبقى كما هي حتّى تنشر أوّلَه.",
            "Nothing published yet — the home page stays as it is until you publish the first item.",
          )}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {live.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <p className="text-xs text-muted">
                {t("نُشر", "Published")} {publishedOn(a.published_at!)}
              </p>
              <p className="mt-1 font-medium">{a.title}</p>
              <form action={setAnnouncementPublished} className="mt-3">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="publish" value="0" />
                <button className="rounded-lg border border-border px-4 py-1.5 text-xs">
                  {t("اسحبها من النشر", "Unpublish")}
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
