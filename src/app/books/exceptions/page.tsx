import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { BookPicker } from "@/components/books/JournalLinks";
import { formatMoney } from "@/lib/ledger/money";
import { EXCEPTION_KINDS } from "@/lib/ledger/journal";
import { loadExceptions, readableBook, type ExceptionRow } from "@/lib/ledger/journalLoad";
import { field, ghost } from "@/lib/ui";

/**
 * تقرير الاستثناءات (البند ٢٠٥): ما يستحقّ نظرةً ثانية في الدفتر — قيدٌ بلا مستند، ومبلغٌ أكبر من عادة حسابه، وقيدٌ
 * بتاريخٍ قديم، وقيدان متشابهان، ونقدٌ بالسالب، وقيدٌ مُعَدّ ينتظر. تقرأه القاعدة (`ledger_exceptions`) بصلاحية القارئ.
 */

const ORDER = ["negative_cash", "duplicate", "large_amount", "back_dated", "no_document", "stale_draft"];
const intIn = (v: string | undefined, d: number, lo: number, hi: number) => {
  const n = v && /^\d+$/.test(v) ? Number(v) : d;
  return Math.min(hi, Math.max(lo, n));
};
const iso = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { book, own } = await readableBook(supabase, user.id, sp.book);
  const backdateDays = intIn(sp.backdate, 30, 1, 3650);
  const draftDays = intIn(sp.drafts, 7, 0, 365);
  const from = iso(sp.from);
  const to = iso(sp.to);
  let rows: ExceptionRow[] = [];
  let failed = false;
  if (book) {
    try {
      rows = await loadExceptions(supabase, book.id, { from, to, backdateDays, draftDays });
    } catch (e) {
      console.error("exceptions failed", e);
      failed = true;
    }
  }
  const usd = (n: number | null) => (n === null ? "" : formatMoney(BigInt(n), "USD"));
  const detail = (r: ExceptionRow) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    switch (r.kind) {
      case "large_amount":
        return t(`نحو ${d.times} مثل الوسيط (${usd(Number(d.median))})`, `about ${d.times} times the median (${usd(Number(d.median))})`);
      case "back_dated":
        return t(`كُتب في ${d.written_on}، بعد تاريخه بـ${d.days} يوماً`, `written on ${d.written_on}, ${d.days} days after its date`);
      case "duplicate":
        return t(`يشبه القيد #${d.other_entry_no} (${d.other_date})`, `like entry #${d.other_entry_no} (${d.other_date})`);
      case "negative_cash":
        return t(`أدنى رصيد، في ${d.days_negative} يوماً بالسالب`, `lowest balance, ${d.days_negative} day(s) negative`);
      case "stale_draft":
        return t(`${d.memo ?? ""} — ينتظر منذ ${d.waiting_days} يوماً`, `${d.memo ?? ""} — waiting ${d.waiting_days} days`);
      default:
        return String(d.memo ?? "");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">
        ← {t("دفتر الحسابات", "Books")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("تقرير الاستثناءات", "Exceptions report")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "ما يستحقّ نظرةً ثانية قبل إقفال الفترة. ليس كلّ ما هنا خطأً: هو ما لا يشبه عادة دفترك.",
          "What deserves a second look before the period is closed. Not everything here is a mistake: it is what does not look like your book's habit.",
        )}
      </p>
      <BookPicker books={own.map((b) => ({ ...b, role: "owner" as const, owner_name: "" }))} current={book?.id ?? null} base="/books/exceptions" locale={locale} />
      {book && (
        <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="book" value={book.id} />
          <label className="flex flex-col gap-1">
            {t("من", "From")}
            <input type="date" name="from" defaultValue={from ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            {t("إلى", "To")}
            <input type="date" name="to" defaultValue={to ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            {t("قديمٌ إن كُتب بعد تاريخه بأكثر من (يوماً)", "Back-dated when written more than (days) after its date")}
            <input type="number" name="backdate" min={1} max={3650} defaultValue={backdateDays} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            {t("مُعَدٌّ ينتظر منذ أكثر من (يوماً)", "Prepared and waiting more than (days)")}
            <input type="number" name="drafts" min={0} max={365} defaultValue={draftDays} className={field} />
          </label>
          <button className={ghost}>{t("اعرض", "Show")}</button>
        </form>
      )}
      {failed && <p className="mt-6 text-sm">{t("تعذّرت قراءة التقرير الآن.", "The report could not be read now.")}</p>}
      {book && !failed && rows.length === 0 && <p className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">{t("لا استثناء في هذه الفترة.", "No exception in this period.")}</p>}
      {ORDER.filter((k) => rows.some((r) => r.kind === k)).map((k) => (
        <section key={k} className="mt-6">
          <h2 className="font-bold">
            {t(EXCEPTION_KINDS[k].ar, EXCEPTION_KINDS[k].en)} ({rows.filter((r) => r.kind === k).length})
          </h2>
          <p className="text-xs text-muted">{t(EXCEPTION_KINDS[k].hint_ar, EXCEPTION_KINDS[k].hint_en)}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {rows
              .filter((r) => r.kind === k)
              .map((r, i) => (
                <li key={`${k}-${i}`} className="rounded-lg border border-border px-3 py-2">
                  {r.entry_no !== null && <span className="font-bold">#{r.entry_no} · </span>}
                  {r.entry_date && <span className="tabular-nums">{r.entry_date} · </span>}
                  {r.account_code && <span>{r.account_code} · </span>}
                  <span className="tabular-nums">{usd(r.amount_minor)}</span>
                  {" · "}
                  {detail(r)}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
