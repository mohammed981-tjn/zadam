import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import ActionNotice from "@/components/ActionNotice";
import { button, card, field, ghost } from "@/lib/ui";
import { INVESTOR_MODEL_LABEL } from "@/lib/investors";
import { lbl } from "@/lib/partners";
import { READ_NOTICE, SENDER_LABEL, type ConversationView } from "@/lib/messages";
import { reportConversation, sendMessage } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "محادثة | سوداقري", "Conversation | Sudagri") };
}

/**
 * One conversation (backlog 137): the request it began from, every message in
 * order under the part its writer plays, and the box to answer. Opening it
 * marks it read and puts out its bell.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo(`/messages/${id}`));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data, error } = await supabase.rpc("conversation_view", { p_conv: id });
  if (error || !data) notFound();
  const c = data as ConversationView;
  await supabase.rpc("conversation_mark_read", { p_conv: id });

  const pending = c.kind === "partnership" && c.status === "pending";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/messages" className="text-sm font-bold text-primary underline">
        {t("← الرسائل", "← Messages")}
      </Link>

      <header className="mt-4 mb-4">
        <h1 className="title-bar font-black leading-tight [overflow-wrap:anywhere]" style={{ fontSize: "var(--text-title)" }}>
          {c.title}
        </h1>
        <p className="mt-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs leading-relaxed">
          {t(READ_NOTICE.ar, READ_NOTICE.en)}
          {pending &&
            t(
              " ولا يُكتب رقم هاتفٍ ولا وسيلة تواصلٍ أخرى قبل أن يقبل صاحب الأرض الطلب؛ بعد القبول يظهر الهاتف لكلٍّ منكما.",
              " No phone number or other contact may be written before the landowner accepts; after acceptance each of you sees the other's phone.",
            )}
        </p>
        {c.agreement_id && c.me !== "member" && (
          <Link href={`/invest/agreements/${c.agreement_id}`} className="mt-2 inline-block text-sm font-bold text-primary underline">
            {t("افتح العقد", "Open the agreement")}
          </Link>
        )}
      </header>

      <ActionNotice ok={sp.ok} error={sp.error} />

      {c.reports && c.reports.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-bold text-danger">{t("بلاغات على هذه المحادثة:", "Reports on this conversation:")}</p>
          <ul className="mt-1 list-disc ps-5">
            {c.reports.map((r, i) => (
              <li key={i} dir="auto">
                {r.reason} <span className="text-xs text-muted">— {timeAgo(r.created_at, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {c.request && (
          <li className={`${card} border-primary/30`}>
            <p className="text-xs font-bold text-muted">
              {t("طلب الشراكة", "The partnership request")} — {lbl(INVESTOR_MODEL_LABEL[c.request.model as keyof typeof INVESTOR_MODEL_LABEL], locale)}
              {" · "}
              {timeAgo(c.request.created_at, locale)}
            </p>
            <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" dir="auto">
              {c.request.message}
            </p>
          </li>
        )}
        {c.messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-2xl border px-4 py-3 shadow-card ${
              m.mine
                ? "self-start border-primary/30 bg-primary/10"
                : m.role === "platform"
                  ? "self-end border-accent/40 bg-accent/5"
                  : "self-end border-border bg-card"
            }`}
          >
            <p className="text-xs font-bold text-muted">
              {m.mine ? t("أنت", "You") : t(SENDER_LABEL[m.role].ar, SENDER_LABEL[m.role].en)}
              {" · "}
              {timeAgo(m.created_at, locale)}
            </p>
            <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" dir="auto">
              {m.body}
            </p>
          </li>
        ))}
      </ol>
      <span id="end" />

      {c.open ? (
        <form action={sendMessage} className="mt-5 flex flex-col gap-2">
          <input type="hidden" name="conversation_id" value={c.id} />
          <label className="flex flex-col gap-1 text-sm">
            {c.me === "admin" ? t("ردّ باسم سوداقري", "Reply as Sudagri") : t("رسالتك", "Your message")}
            <textarea name="body" required maxLength={2000} rows={3} className={field} dir="auto" />
          </label>
          <button className={`${button} self-start`}>{t("أرسل", "Send")}</button>
        </form>
      ) : (
        <p className="mt-5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
          {t(
            "أُغلق هذا الطلب، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.",
            "This request is closed, so no new messages. What was written stays on record.",
          )}
        </p>
      )}

      {c.me !== "admin" && (
        <details className="mt-6 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted">{t("أبلغ عن هذه المحادثة", "Report this conversation")}</summary>
          <form action={reportConversation} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="conversation_id" value={c.id} />
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={2}
              placeholder={t("ما الذي حدث؟ مثلاً: طلب دفعاً خارج العقد.", "What happened? For example: asked for a payment outside the agreement.")}
              className={field}
              dir="auto"
            />
            <button className={`${ghost} self-start`}>{t("أرسل البلاغ إلى الإدارة", "Send the report to the administration")}</button>
          </form>
        </details>
      )}
    </div>
  );
}
