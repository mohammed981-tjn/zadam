import Link from "next/link";
import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { button, card } from "@/lib/ui";
import { READ_NOTICE, type ConversationRow } from "@/lib/messages";
import { openSupportConversation } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "الرسائل | سوداقري", "Messages | Sudagri") };
}

/**
 * صندوق الرسائل (البند ١٣٧): every conversation the reader is part of — one per
 * partnership request, and «راسل سوداقري». An administrator sees every thread
 * that has a message in it, reported ones first (the owner's choice, 23
 * October).
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/messages"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data, error } = await supabase.rpc("my_conversations");
  if (error) console.error("messages: list failed", error);
  const rows = (data ?? []) as ConversationRow[];
  const hasSupport = rows.some((r) => r.kind === "support" && r.my_role === "member");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader icon="message" eyebrow={t("الرسائل", "Messages")} title={t("رسائلك", "Your messages")}>
        {t(
          "كلّ محادثةٍ هنا مربوطةٌ بطلب شراكةٍ أو بعقده، أو بإدارة سوداقري. ",
          "Every conversation here is tied to a partnership request or its agreement, or to Sudagri's administration. ",
        )}
        {t(READ_NOTICE.ar, READ_NOTICE.en)}
      </PageHeader>

      <ActionNotice ok={sp.ok} error={sp.error} />

      {!hasSupport && (
        <form action={openSupportConversation} className="mb-5">
          <button className={button}>{t("راسل سوداقري", "Write to Sudagri")}</button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>
          {t(
            "لا محادثات بعد. تبدأ المحادثة من طلب الشراكة: في «أراضيّ» إن كنتَ صاحب أرض، وفي «طلباتي» إن كنتَ مستثمراً.",
            "No conversations yet. A conversation starts from a partnership request: in «My land» if you own land, in «My requests» if you invest.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/messages/${r.id}`}
                className={`${card} flex items-start gap-3 transition hover:border-rose ${r.unread > 0 ? "border-primary/40" : ""}`}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {r.kind === "support" ? "🏛️" : "🤝"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="[overflow-wrap:anywhere]">{r.title}</strong>
                    {r.last_message_at && (
                      <span className="text-xs text-muted">{timeAgo(r.last_message_at, locale)}</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted" dir="auto">
                    {r.last_body ?? t("لا رسائل بعد", "No messages yet")}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {r.unread > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-bold text-primary-foreground">
                        {t(`${r.unread} جديدة`, `${r.unread} new`)}
                      </span>
                    )}
                    {!r.open && (
                      <span className="rounded-full bg-border px-2 py-0.5 text-muted">{t("مغلقة", "Closed")}</span>
                    )}
                    {r.reported && r.my_role === "admin" && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">{t("مبلَّغٌ عنها", "Reported")}</span>
                    )}
                    {r.needs_reply && r.my_role === "admin" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 font-bold text-accent">{t("تنتظر ردّك", "Awaiting your reply")}</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
