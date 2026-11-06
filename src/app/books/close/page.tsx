import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import { BookPicker } from "@/components/books/JournalLinks";
import { ledgerToday } from "@/lib/ledger/today";
import { dayBefore } from "@/lib/ledger/reportParams";
import { loadClose, readableBook } from "@/lib/ledger/journalLoad";
import { button, card, field } from "@/lib/ui";
import { closeIncomeAction, closeSeasonAction, lockAction, reopenAction } from "../journal/actions";

/**
 * إقفال الفترة (البند ٢٠٥): صاحب الدفتر يقفل حتى يومٍ مضى فلا يُكتب فيه شيءٌ بعده، ويُقفل دخل الفترة (أو الموسم) في
 * الأرباح المحتجزة بقيدٍ واحدٍ تبنيه القاعدة من الأرصدة. ولا يُعاد فتح الفترة إلا بيد الإدارة وبسببٍ مكتوب يراه صاحبه.
 */
export default async function ClosePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { book, own } = await readableBook(supabase, user.id, sp.book);
  const { data: admin } = await supabase.rpc("is_admin");
  const today = ledgerToday();
  const yesterday = dayBefore(today);
  const owner = !!book && book.owner_id === user.id;
  const data = book ? await loadClose(supabase, book.id, user.id) : null;
  const lastPeriod = data?.closings.find((c) => c.scope === "period");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">
        ← {t("دفتر الحسابات", "Books")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("إقفال الفترة", "Closing the period")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "حين تنتهي من مراجعة فترةٍ أقفلها: لا يُكتب بعد ذلك قيدٌ بتاريخٍ فيها، لا منك ولا من مُعِدٍّ ولا من النظام. والخطأ بعد الإقفال يُصحَّح بقيدٍ بتاريخٍ بعده. ولا تُعاد الفترة مفتوحةً إلا بيد الإدارة، بسببٍ مكتوبٍ تراه في سجلّ التدقيق.",
          "When you have finished reviewing a period, close it: nothing can be dated in it afterwards — not by you, a preparer or the system. A mistake found later is corrected with an entry dated after it. Only the administrators can reopen a period, with a written reason you see in the audit log.",
        )}
      </p>
      <BookPicker books={own.map((b) => ({ ...b, role: "owner" as const, owner_name: "" }))} current={book?.id ?? null} base="/books/close" locale={locale} />
      <div className="mt-4">
        <ActionNotice ok={sp.ok} error={sp.error} />
      </div>
      {!book ? (
        <p className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">{t("لا دفتر لك بعد.", "You have no book yet.")}</p>
      ) : (
        <>
          <p className="mt-4 text-sm">
            {book.closed_through ? t(`الدفتر مقفلٌ حتى ${book.closed_through}.`, `The book is closed through ${book.closed_through}.`) : t("لم يُقفل الدفتر بعد.", "The book has not been closed yet.")}
            {lastPeriod && ` ${t(`وأُقفل الدخل في الأرباح المحتجزة حتى ${lastPeriod.period_to}.`, `Income was closed into retained earnings through ${lastPeriod.period_to}.`)}`}
          </p>

          {owner && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <form action={closeIncomeAction} className={card}>
                <input type="hidden" name="book" value={book.id} />
                <h2 className="font-bold">{t("أقفل دخل الفترة وأقفلها", "Close the period's income, and the period")}</h2>
                <p className="mt-1 text-xs leading-6 text-muted">
                  {t(
                    "قيدٌ واحد يُصفّر حسابات الإيراد والمصروف إلى الأرباح المحتجزة، تبنيه القاعدة من الأرصدة، ثمّ تُقفل الفترة. قائمة الدخل تبقى كما هي لأنّها تحسب الإقفال من التواريخ.",
                    "One entry, built from the balances, turns the revenue and expense accounts over to retained earnings, then the period is closed. The income statement stays as it was: it already carries the earnings forward by date.",
                  )}
                </p>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  {t("آخر يومٍ في الفترة", "The period's last day")}
                  <input type="date" name="through" required max={yesterday} defaultValue={yesterday} className={field} />
                </label>
                <button className={`${button} mt-3`}>{t("أقفل الدخل والفترة", "Close income and period")}</button>
              </form>

              <form action={lockAction} className={card}>
                <input type="hidden" name="book" value={book.id} />
                <h2 className="font-bold">{t("أقفل الفترة وحدها", "Close the period only")}</h2>
                <p className="mt-1 text-xs leading-6 text-muted">
                  {t("لا قيد بعدها بتاريخٍ حتى هذا اليوم، ولا قيد إقفال. يُقفل يومٌ مضى فقط.", "No entry dated up to this day afterwards, and no closing entry. Only a day that has passed.")}
                </p>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  {t("أقفل حتى", "Close through")}
                  <input type="date" name="through" required max={yesterday} defaultValue={yesterday} className={field} />
                </label>
                <button className={`${button} mt-3`}>{t("أقفل", "Close")}</button>
              </form>

              {data && data.seasons.length > 0 && (
                <form action={closeSeasonAction} className={`${card} sm:col-span-2`}>
                  <input type="hidden" name="book" value={book.id} />
                  <h2 className="font-bold">{t("أقفل دخل موسمٍ انتهى", "Close the income of a finished season")}</h2>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    {t("سطور الموسم من إيرادٍ ومصروفٍ إلى الأرباح المحتجزة، مرّةً واحدة. ربحيّة الموسم تبقى كما هي.", "The season's revenue and expense lines to retained earnings, once. The season's profit report stays as it was.")}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <select name="season" className={field} required>
                      {data.seasons.map((s) => (
                        <option key={s.id} value={s.id} disabled={s.closed}>
                          {s.name}
                          {s.closed ? ` — ${t("أُقفل", "closed")}` : ""}
                        </option>
                      ))}
                    </select>
                    <input type="date" name="date" max={today} defaultValue={today} className={field} />
                  </div>
                  <button className={`${button} mt-3`}>{t("أقفل دخل الموسم", "Close the season's income")}</button>
                </form>
              )}
            </div>
          )}

          {admin === true && book.closed_through && (
            <form action={reopenAction} className={`${card} mt-6`}>
              <input type="hidden" name="book" value={book.id} />
              <h2 className="font-bold">{t("للإدارة: أعد فتح الفترة", "Administrators: reopen the period")}</h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                {t("يُسجَّل السبب ومن فعل في سجلّ التدقيق، ويُخبَر صاحب الدفتر.", "The reason and who did it go into the audit log, and the book's owner is told.")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  {t("يبقى مقفلاً حتى (فارغٌ: يُفتح كلّه)", "Stays closed through (empty: fully open)")}
                  <input type="date" name="through" max={dayBefore(book.closed_through)} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("السبب", "Reason")}
                  <input name="reason" required minLength={10} maxLength={500} className={field} />
                </label>
              </div>
              <button className={`${button} mt-3`}>{t("أعد فتحها", "Reopen it")}</button>
            </form>
          )}

          {data && (data.closings.length > 0 || data.reopens.length > 0) && (
            <section className="mt-8">
              <h2 className="font-bold">{t("ما أُقفل وما أُعيد فتحه", "What was closed and reopened")}</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.closings.map((c) => (
                  <li key={c.id}>
                    {c.scope === "period"
                      ? t(`دخل الفترة ${c.period_from ?? "من أوّلها"} – ${c.period_to}`, `Income of ${c.period_from ?? "the start"} – ${c.period_to}`)
                      : t(`دخل موسم، في ${c.period_to}`, `A season's income, on ${c.period_to}`)}
                  </li>
                ))}
                {data.reopens.map((r) => (
                  <li key={r.id}>
                    {t(
                      `أُعيد الفتح من ${r.was_through} إلى ${r.now_through ?? "غير مقفل"}: ${r.reason}`,
                      `Reopened from ${r.was_through} to ${r.now_through ?? "open"}: ${r.reason}`,
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
