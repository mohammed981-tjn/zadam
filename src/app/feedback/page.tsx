import { createClient } from "@/lib/supabase/server";
import FeedbackForm from "@/components/FeedbackForm";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback";
import type { Feedback, FeedbackStatus } from "@/types/database";

export const metadata = { title: "ملاحظات واقتراحات — سودجري" };
export const dynamic = "force-dynamic";

const STATUS: Record<
  FeedbackStatus,
  { label: string; className: string }
> = {
  new: { label: "قيد النظر", className: "bg-background text-muted" },
  planned: {
    label: "مخطَّط له",
    className: "bg-sky-600/10 text-sky-800",
  },
  done: { label: "نُفِّذ", className: "bg-emerald-600/10 text-emerald-800" },
  declined: {
    label: "لن يُنفَّذ",
    className: "bg-rose-600/10 text-rose-800",
  },
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Note({ note, mine }: { note: Feedback; mine?: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
          {FEEDBACK_KIND_LABEL[note.kind as FeedbackKind] ?? note.kind}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${STATUS[note.status].className}`}
        >
          {STATUS[note.status].label}
        </span>
        {note.display_name && (
          <span className="text-muted">{note.display_name}</span>
        )}
        {mine && <span className="text-muted">ملاحظتك</span>}
        <span className="text-muted">{when(note.created_at)}</span>
        {note.page_path && (
          <span className="text-muted">من {note.page_path}</span>
        )}
      </div>

      <p className="whitespace-pre-wrap leading-relaxed">{note.body}</p>

      {/* The automatic reply comes first because it arrived first, and it is
          labelled without euphemism. A machine answer presented as a person's
          is the one thing that would make this feature cost more trust than it
          earns — so it says what wrote it, and says a person is still coming. */}
      {note.ai_reply && (
        <div className="mt-3 rounded-lg border-s-2 border-s-accent bg-accent/5 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-accent">
            ردٌّ آليٌّ من مساعد سودجري — ولم يقرأه موظّفٌ بعد
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {note.ai_reply}
          </p>
        </div>
      )}

      {note.admin_reply && (
        <div className="mt-3 rounded-lg border-s-2 border-s-primary bg-primary/5 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-primary">ردّ الإدارة</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {note.admin_reply}
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * PostgreSQL renders an interval as "00:15:00" and a visitor does not read
 * that. Only the shapes this policy actually allows are handled — between one
 * minute and twenty-four hours — and anything unexpected is returned untouched
 * rather than mangled into a wrong number.
 */
function arabicInterval(raw: string): string {
  const match = /^(\d+):(\d+):(\d+)/.exec(raw);
  if (!match) return raw;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours === 0) {
    if (minutes === 15) return "ربع ساعة";
    if (minutes === 30) return "نصف ساعة";
    return `${minutes} دقيقة`;
  }
  if (minutes === 0) return hours === 1 ? "ساعة" : `${hours} ساعات`;
  return `${hours} ساعة و${minutes} دقيقة`;
}

/**
 * The public board, and the visitor's own thread.
 *
 * Row-level security does the separating, not this file: the query asks for
 * everything and comes back with the published notes plus, when there is a
 * session, that person's own. Filtering here as well would imply the filter is
 * what keeps one visitor's note out of another's view.
 */
export default async function FeedbackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * The waiting time is read from the policy row, never written into this
   * sentence. The whole point of putting it in a table was that an
   * administrator can change it — and a promise on the page that disagrees with
   * the job that keeps it is worse than no promise, because the visitor is the
   * one who finds out.
   *
   * `maybeSingle` and a null fall-back: if the read fails, the page says
   * nothing about timing rather than inventing a number.
   */
  const { data: policyRow } = await supabase
    .from("support_policy")
    .select("auto_reply_after, enabled, kinds")
    .maybeSingle();

  const policy = policyRow as {
    auto_reply_after: string;
    enabled: boolean;
    kinds: string[];
  } | null;

  const { data } = await supabase
    .from("feedback")
    .select(
      "id, kind, body, status, admin_reply, ai_reply, ai_replied_at, display_name, page_path, published, author_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const notes = (data ?? []) as Feedback[];
  const mine = user ? notes.filter((n) => n.author_id === user.id) : [];
  const board = notes.filter((n) => n.published);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">ملاحظات واقتراحات</h1>
        <p className="text-lg leading-relaxed text-muted">
          المنصّة تُبنى الآن، وأنت ترى ما لا نراه. اكتب ما أربكك أو ما تريد
          إضافته — تُقرأ كل ملاحظة، وتُنشر هنا مع ردّ الإدارة حين تكون مفيدة
          لغيرك.
        </p>
        {policy?.enabled && (
          <p className="text-sm leading-relaxed text-muted">
            وإن لم يردّ موظّفٌ خلال{" "}
            <strong>{arabicInterval(policy.auto_reply_after)}</strong>، يصلك ردٌّ
            آليٌّ من مساعد سودجري بما تعرفه المنصّة عن سؤالك — ثمّ يراجعه موظّف.
            فلا تنتظر في صمت.
          </p>
        )}
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">اكتب ملاحظتك</h2>
        <FeedbackForm signedIn={Boolean(user)} />
      </section>

      {mine.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">ملاحظاتك</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((n) => (
              <Note key={n.id} note={n} mine />
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">ملاحظات منشورة وردودها</h2>
        {board.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm leading-relaxed text-muted">
            لم يُنشر شيء بعد. الملاحظات تصل الإدارة أولاً، ولا يظهر هنا إلا ما
            تختار الإدارة نشره — فلا يتحوّل هذا المكان إلى لوحة لكل ما يُكتب.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {board
              .filter((n) => !mine.some((m) => m.id === n.id))
              .map((n) => (
                <Note key={n.id} note={n} />
              ))}
          </ul>
        )}
      </section>
    </main>
  );
}
