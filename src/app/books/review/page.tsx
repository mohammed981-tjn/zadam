import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import { bookLabel } from "@/components/books/JournalLinks";
import { formatMoney, isCurrency } from "@/lib/ledger/money";
import { accountName, type ChartAccount } from "@/lib/ledger/journal";
import { loadReview, type DraftRow, type PreparerRow } from "@/lib/ledger/journalLoad";
import { button, card, field, ghost } from "@/lib/ui";
import {
  addAgentAction,
  answerAction,
  approveAction,
  endPreparerAction,
  inviteAction,
  rejectAction,
  reviewSettingAction,
  withdrawAction,
} from "../journal/actions";

/**
 * المراجعة (البند ٢٠٥): المُعِدّ والمعتمِد. صاحب الدفتر يرى ما أُعِدّ في دفاتره فيعتمده أو يردّه بسبب، ويأذن لوكيله أو
 * لمحاسبٍ أن يُعِدّ، ويطلب إن شاء مراجعة قيوده هو. والمُعِدّ يرى دعواته وما أعدّه وحاله، ويسحب ما لم يُبتّ فيه.
 */

const STATUS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "ينتظر الاعتماد", en: "Waiting for approval" },
  posted: { ar: "اعتُمد ورُحِّل", en: "Approved and posted" },
  rejected: { ar: "رُدّ", en: "Turned back" },
  withdrawn: { ar: "سُحب", en: "Withdrawn" },
  invited: { ar: "مدعوّ", en: "Invited" },
  active: { ar: "يُعِدّ", en: "Preparing" },
  declined: { ar: "اعتذر", en: "Declined" },
  ended: { ar: "انتهى", en: "Ended" },
};

function DraftLines({ d, chart, locale }: { d: DraftRow; chart: ChartAccount[]; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const name = (code?: string) => {
    const a = chart.find((c) => c.code === code);
    return a ? `${a.code} — ${accountName(a, locale)}` : (code ?? "");
  };
  return (
    <table className="mt-2 w-full text-sm">
      <tbody>
        {d.lines.map((l, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1">{name(l.account)}</td>
            <td className="py-1 text-end tabular-nums">{l.side === "D" ? formatMoney(BigInt(l.minor), isCurrency(l.currency) ? l.currency : "USD") : ""}</td>
            <td className="py-1 text-end tabular-nums">{l.side === "C" ? formatMoney(BigInt(l.minor), isCurrency(l.currency) ? l.currency : "USD") : ""}</td>
          </tr>
        ))}
        <tr className="text-xs text-muted">
          <td />
          <td className="text-end">{t("مدين", "Debit")}</td>
          <td className="text-end">{t("دائن", "Credit")}</td>
        </tr>
      </tbody>
    </table>
  );
}

function preparerName(p: PreparerRow | undefined, locale: Locale): string {
  if (!p) return tr(locale, "أنت", "You");
  const who = p.full_name ?? (p.contact_tail ? `…${p.contact_tail}` : "");
  return p.role === "agent" ? `${p.company_name ?? tr(locale, "وكيلك", "Your agent")}${who ? ` (${who})` : ""}` : who || tr(locale, "المحاسب", "The accountant");
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const data = await loadReview(supabase, user.id);

  // A short-lived link to each document, read through the policy that lets the book's reader (and its preparer) see it.
  const paths = [...data.owned.flatMap((o) => o.pending), ...data.prepared].map((d) => d.document_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  await Promise.all(
    [...new Set(paths)].map(async (p) => {
      const { data: s } = await supabase.storage.from("evidence").createSignedUrl(p, 600);
      if (s?.signedUrl) signed.set(p, s.signedUrl);
    }),
  );
  const docLink = (p: string | null) =>
    p && signed.get(p) ? (
      <a href={signed.get(p)} target="_blank" rel="noreferrer" className="text-primary underline">
        {t("المستند", "Document")}
      </a>
    ) : (
      <span className="text-muted">{t("بلا مستند", "No document")}</span>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">
        ← {t("دفتر الحسابات", "Books")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("المراجعة: المُعِدّ والمعتمِد", "Review: preparer and approver")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "من تأذن له يُعِدّ قيود دفترك، ولا يُرحَّل شيءٌ ممّا أعدّه حتى تعتمده أنت، أو تردّه بسبب. ولا يرى من دفترك إلا شجرة حساباته وما أعدّه.",
          "Whoever you allow prepares your book's entries; nothing they prepare is posted until you approve it, or you turn it back with a reason. They see nothing of your book but its chart of accounts and what they prepared.",
        )}
      </p>
      <div className="mt-4">
        <ActionNotice ok={sp.ok} error={sp.error} />
      </div>

      {data.invitations.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-bold">{t("دعواتٌ إليك", "Invitations to you")}</h2>
          {data.invitations.map((i) => (
            <div key={i.id} className={card}>
              <p className="text-sm">
                {t(`${i.owner_name || "صاحب دفتر"} يدعوك لتُعِدّ قيود دفتره.`, `${i.owner_name || "A book owner"} invites you to prepare their book's entries.`)}
              </p>
              <div className="mt-3 flex gap-2">
                <form action={answerAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="accept" value="yes" />
                  <button className={button}>{t("أقبل", "Accept")}</button>
                </form>
                <form action={answerAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="accept" value="no" />
                  <button className={ghost}>{t("أعتذر", "Decline")}</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.owned.map(({ book, pending, preparers, chart }) => {
        const byRef = new Map(preparers.map((p) => [p.id, p]));
        const open = preparers.filter((p) => p.status === "invited" || p.status === "active");
        return (
          <section key={book.id} className="mt-8">
            <h2 className="text-lg font-bold">{bookLabel(book, locale)}</h2>

            <form action={reviewSettingAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="book" value={book.id} />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="always" defaultChecked={book.always_review} />
                {t("راجع كلّ قيد، قيودي أنا أيضاً، قبل ترحيله", "Review every entry, mine too, before it posts")}
              </label>
              <button className={ghost}>{t("احفظ", "Save")}</button>
            </form>

            <h3 className="mt-5 font-bold">
              {t("ينتظر اعتمادك", "Waiting for your approval")} ({pending.length})
            </h3>
            {pending.length === 0 && <p className="mt-2 text-sm text-muted">{t("لا شيء ينتظر.", "Nothing is waiting.")}</p>}
            <div className="mt-2 space-y-3">
              {pending.map((d) => (
                <div key={d.id} className={card}>
                  <p className="text-sm">
                    <span className="font-bold">{d.memo}</span> · {d.entry_date} · {t("أعدّه", "prepared by")} {preparerName(d.preparer_ref ? byRef.get(d.preparer_ref) : undefined, locale)} · {docLink(d.document_path)}
                  </p>
                  <DraftLines d={d} chart={chart} locale={locale} />
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <form action={approveAction}>
                      <input type="hidden" name="draft" value={d.id} />
                      <button className={button}>{t("أعتمده فيُرحَّل", "Approve and post")}</button>
                    </form>
                    <form action={rejectAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="draft" value={d.id} />
                      <input name="note" required minLength={3} maxLength={300} className={`${field} w-64`} placeholder={t("سبب الردّ", "Why it is turned back")} />
                      <button className={ghost}>{t("أردّه", "Turn it back")}</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-6 font-bold">{t("من يُعِدّ قيود هذا الدفتر", "Who prepares this book's entries")}</h3>
            {preparers.length === 0 && <p className="mt-2 text-sm text-muted">{t("لا أحد غيرك.", "Nobody but you.")}</p>}
            <ul className="mt-2 space-y-2 text-sm">
              {preparers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {preparerName(p, locale)} · {t(STATUS[p.status].ar, STATUS[p.status].en)}
                    {p.status === "active" && !p.standing && ` · ${t("سقط إذن الوكيل", "the agent's mandate has lapsed")}`}
                  </span>
                  {(p.status === "invited" || p.status === "active") && (
                    <form action={endPreparerAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-primary underline">{t("أنهِ الإذن", "End the permission")}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {open.length < 5 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={inviteAction} className={card}>
                  <input type="hidden" name="book" value={book.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    {t("ادعُ محاسباً بجوّاله أو بريده (له حسابٌ في سوداقري)", "Invite an accountant by mobile or e-mail (they have a Sudagri account)")}
                    <input name="contact" required className={field} placeholder="09… / name@example.com" />
                  </label>
                  <button className={`${button} mt-3`}>{t("ادعُه", "Invite")}</button>
                </form>
                {book.kind === "farm" && data.agents.length > 0 && (
                  <form action={addAgentAction} className={card}>
                    <input type="hidden" name="book" value={book.id} />
                    <label className="flex flex-col gap-1 text-sm">
                      {t("أو اجعل وكيلك مُعِدّاً بإذنه القائم", "Or make your agent a preparer under their standing mandate")}
                      <select name="mandate" className={field}>
                        {data.agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.company_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className={`${button} mt-3`}>{t("اجعله مُعِدّاً", "Make them a preparer")}</button>
                  </form>
                )}
              </div>
            )}
          </section>
        );
      })}

      {data.preparing.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">{t("دفاترُ تُعِدّ قيودها", "Books you prepare entries for")}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {data.preparing.map((b) => (
              <li key={b.id}>
                <Link href={`/books/journal/new?book=${b.id}`} className="text-primary underline">
                  {bookLabel(b, locale)} — {t("أعِدّ قيداً", "prepare an entry")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.prepared.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">{t("ما أعددته لغيرك", "What you prepared for others")}</h2>
          <div className="mt-3 space-y-3">
            {data.prepared.map((d) => (
              <div key={d.id} className={card}>
                <p className="text-sm">
                  <span className="font-bold">{d.memo}</span> · {d.entry_date} · {t(STATUS[d.status].ar, STATUS[d.status].en)} · {docLink(d.document_path)}
                </p>
                {d.decision_note && (
                  <p className="mt-1 text-sm">
                    {t("السبب:", "Reason:")} {d.decision_note}
                  </p>
                )}
                {d.status === "pending" && (
                  <form action={withdrawAction} className="mt-2">
                    <input type="hidden" name="draft" value={d.id} />
                    <button className={ghost}>{t("اسحبه", "Withdraw it")}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
