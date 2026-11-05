import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback";
import type { Feedback, FeedbackStatus } from "@/types/database";
import { replyToFeedback, deleteFeedback } from "./actions";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";

export const metadata = { title: "ملاحظات الزوّار | سوداقري" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "قيد النظر",
  planned: "مخطَّط له",
  done: "نُفِّذ",
  declined: "لن يُنفَّذ",
};

const STATUS_LABEL_EN: Record<FeedbackStatus, string> = {
  new: "Under review",
  planned: "Planned",
  done: "Done",
  declined: "Won't be done",
};

const KIND_LABEL_EN: Record<FeedbackKind, string> = {
  suggestion: "Suggestion",
  problem: "Problem",
  question: "Question",
};

const date = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  // Same gate as every other admin screen: checked here so the page never
  // renders for a non-admin, and enforced again by RLS on every write.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const [{ data }, { data: contactRows }] = await Promise.all([
    supabase
      .from("feedback")
      .select(MEMBER_COLUMNS.feedback)
      .order("created_at", { ascending: false })
      .limit(200),
    // How to reach the writer left the table's member columns (backlog 132).
    supabase.rpc("feedback_contacts"),
  ]);

  const contacts = new Map(((contactRows ?? []) as { id: string; contact: string }[]).map((r) => [r.id, r.contact]));
  const notes = ((data ?? []) as unknown as Feedback[]).map((n) => ({ ...n, contact: contacts.get(n.id) ?? null }));
  const unanswered = notes.filter((n) => !n.admin_reply).length;

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("ملاحظات الزوّار", "Visitor feedback")}</h1>
        <p className="text-sm text-muted">
          {t(`${notes.length} ملاحظة`, `${notes.length} notes`)} · <strong>{unanswered}</strong>{" "}
          {t("بلا ردّ", "without a reply")}
        </p>
      </header>

      {message && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {notes.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm leading-relaxed text-muted">
          {t("لا ملاحظات بعد. النموذج مفتوح للجميع على", "No feedback yet. The form is open to everyone at")}{" "}
          <code className="rounded bg-background px-1">/feedback</code>{" "}
          {t(
            "بلا حساب، فأول ملاحظة ستصل بمجرّد أن يزور أحدهم الصفحة.",
            "with no account needed, so the first note will arrive as soon as someone visits the page.",
          )}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {notes.map((note) => (
          <li
            key={note.id}
            className={`rounded-xl border bg-card p-4 ${
              note.admin_reply ? "border-border" : "border-primary/40"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {(locale === "en" ? KIND_LABEL_EN : FEEDBACK_KIND_LABEL)[note.kind as FeedbackKind] ?? note.kind}
              </span>
              <span>{date(note.created_at, locale)}</span>
              {note.page_path && <span>{t("من", "from")} {note.page_path}</span>}
              {note.display_name && <span>· {note.display_name}</span>}
              {note.contact && (
                <span className="font-medium text-foreground">
                  · {note.contact}
                </span>
              )}
              <span>
                ·{" "}
                {note.author_id
                  ? t("صاحب حساب — سيصله إشعار بالردّ", "Account holder — will be notified of the reply")
                  : t("زائر مجهول", "Anonymous visitor")}
              </span>
              {note.published && (
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-800">
                  {t("منشورة", "Published")}
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap leading-relaxed">{note.body}</p>

            <form action={replyToFeedback} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="feedback_id" value={note.id} />

              <label className="flex flex-col gap-1 text-sm">
                {t("الردّ", "Reply")}
                <textarea
                  name="admin_reply"
                  rows={3}
                  maxLength={2000}
                  defaultValue={note.admin_reply ?? ""}
                  placeholder={t("اتركه فارغاً لمسح الردّ", "Leave empty to clear the reply")}
                  className={field}
                />
              </label>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  {t("الحالة", "Status")}
                  <select
                    name="status"
                    defaultValue={note.status}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {(
                      Object.keys(STATUS_LABEL) as FeedbackStatus[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {locale === "en" ? STATUS_LABEL_EN[s] : STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={note.published}
                    className="size-4"
                  />
                  {t("انشرها للجميع", "Publish for everyone")}
                </label>

                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {t("حفظ", "Save")}
                </button>
              </div>
            </form>

            <form action={deleteFeedback} className="mt-2">
              <input type="hidden" name="feedback_id" value={note.id} />
              <button
                type="submit"
                className="text-xs text-danger underline"
              >
                {t("حذف (للرسائل المزعجة)", "Delete (for spam)")}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
