import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback";
import type { Feedback, FeedbackStatus } from "@/types/database";
import { replyToFeedback, deleteFeedback } from "./actions";

export const metadata = { title: "ملاحظات الزوّار | سودجري" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "قيد النظر",
  planned: "مخطَّط له",
  done: "نُفِّذ",
  declined: "لن يُنفَّذ",
};

const date = (iso: string) =>
  new Date(iso).toLocaleString("ar-EG", {
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
  if (!user) redirect("/login");

  // Same gate as every other admin screen: checked here so the page never
  // renders for a non-admin, and enforced again by RLS on every write.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const notes = (data ?? []) as Feedback[];
  const unanswered = notes.filter((n) => !n.admin_reply).length;

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">ملاحظات الزوّار</h1>
        <p className="text-sm text-muted">
          {notes.length} ملاحظة · <strong>{unanswered}</strong> بلا ردّ
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
          لا ملاحظات بعد. النموذج مفتوح للجميع على{" "}
          <code className="rounded bg-background px-1">/feedback</code> بلا
          حساب، فأول ملاحظة ستصل بمجرّد أن يزور أحدهم الصفحة.
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
                {FEEDBACK_KIND_LABEL[note.kind as FeedbackKind] ?? note.kind}
              </span>
              <span>{date(note.created_at)}</span>
              {note.page_path && <span>من {note.page_path}</span>}
              {note.display_name && <span>· {note.display_name}</span>}
              {note.contact && (
                <span className="font-medium text-foreground">
                  · {note.contact}
                </span>
              )}
              <span>
                ·{" "}
                {note.author_id
                  ? "صاحب حساب — سيصله إشعار بالردّ"
                  : "زائر مجهول"}
              </span>
              {note.published && (
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-800">
                  منشورة
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap leading-relaxed">{note.body}</p>

            <form action={replyToFeedback} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="feedback_id" value={note.id} />

              <label className="flex flex-col gap-1 text-sm">
                الردّ
                <textarea
                  name="admin_reply"
                  rows={3}
                  maxLength={2000}
                  defaultValue={note.admin_reply ?? ""}
                  placeholder="اتركه فارغاً لمسح الردّ"
                  className={field}
                />
              </label>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  الحالة
                  <select
                    name="status"
                    defaultValue={note.status}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {(
                      Object.keys(STATUS_LABEL) as FeedbackStatus[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
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
                  انشرها للجميع
                </label>

                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  حفظ
                </button>
              </div>
            </form>

            <form action={deleteFeedback} className="mt-2">
              <input type="hidden" name="feedback_id" value={note.id} />
              <button
                type="submit"
                className="text-xs text-danger underline"
              >
                حذف (للرسائل المزعجة)
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
