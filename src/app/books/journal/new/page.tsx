import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { ledgerToday } from "@/lib/ledger/today";
import { templatesFor } from "@/lib/ledger/journal";
import { loadChart, loadTemplates, writableBooks } from "@/lib/ledger/journalLoad";
import JournalEntryForm from "@/components/books/JournalEntryForm";
import { BookPicker, bookLabel } from "@/components/books/JournalLinks";
import { button } from "@/lib/ui";
import { openFarmBookAction } from "../actions";

/**
 * قيدٌ جديد (البند ٢٠٥): قيد يوميّةٍ يكتبه صاحب الدفتر أو مُعِدّه — يدويّاً أو من قيدٍ جاهز — ببيانٍ وتاريخٍ ومستند.
 * The owner's entry posts at once (unless he asked to review every entry); a preparer's waits for the owner.
 */
export default async function NewJournalEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const books = await writableBooks(supabase, user.id);
  const usable = books.filter((b) => b.kind !== "platform");
  const book = usable.find((b) => b.id === sp.book) ?? usable.find((b) => b.role === "owner" && b.kind === "farm") ?? usable[0] ?? null;
  const [chart, templates] = book ? await Promise.all([loadChart(supabase, book.id).catch(() => []), loadTemplates(supabase)]) : [[], []];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">
        ← {t("دفتر الحسابات", "Books")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("قيدٌ جديد", "New journal entry")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "كلّ قيدٍ مدينٌ ودائنٌ بالمبلغ نفسه، من حسابات دفترك. يُرفض القيد غير المتوازن، ولا يُعدَّل القيد بعد ترحيله: يُعكس بقيدٍ جديد.",
          "Every entry has debits and credits of the same amount, from your book's accounts. An unbalanced entry is refused, and a posted entry is never edited: it is reversed with a new one.",
        )}
      </p>
      <BookPicker books={usable} current={book?.id ?? null} base="/books/journal/new" locale={locale} />
      {!book ? (
        <form action={openFarmBookAction} className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
          <p>{t("لا دفتر تكتب فيه بعد. يُفتح دفتر مزرعتك بشجرة حساباته كاملة.", "There is no book you can write in yet. Your farm book opens with its full chart of accounts.")}</p>
          <button className={`${button} mt-3`}>{t("افتح دفتر المزرعة", "Open the farm book")}</button>
        </form>
      ) : (
        <>
          <p className="mt-4 text-sm">
            <span className="font-bold">{bookLabel(book, locale)}</span>
            {book.closed_through && ` · ${t("مقفل حتى", "closed through")} ${book.closed_through}`}
            {book.role === "preparer"
              ? ` · ${t("أنت مُعِدّ: ما ترسله ينتظر اعتماد صاحب الدفتر.", "You are a preparer: what you send waits for the owner's approval.")}`
              : book.always_review
                ? ` · ${t("طلبت مراجعة كلّ قيد: يُعرض عليك قبل ترحيله.", "You asked to review every entry: it is shown to you before it posts.")}`
                : ""}
          </p>
          <JournalEntryForm
            key={book.id}
            bookId={book.id}
            chart={chart}
            templates={templatesFor(templates, book.kind)}
            today={ledgerToday()}
            initialTemplate={sp.template ?? null}
            preparer={book.role === "preparer"}
          />
        </>
      )}
    </div>
  );
}
