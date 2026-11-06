import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { bookLabel, type WritableBook } from "@/lib/ledger/journalLoad";

export { bookLabel };

/**
 * روابط القيد والمراجعة (البند ٢٠٥) في رأس صفحة الدفاتر، ومعها عدد ما ينتظر القارئ: قيودٌ أُعِدّت في دفاتره ودعواتٌ إليه.
 * Its own component, so /books/page.tsx carries one line for it beside its other buttons.
 */
export default async function JournalLinks({ supabase, me, locale }: { supabase: SupabaseClient; me: string; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [{ data: books }, { data: mine }] = await Promise.all([
    supabase.from("ledger_books").select("id").eq("owner_id", me),
    supabase.rpc("ledger_preparer_mine"),
  ]);
  const ids = ((books ?? []) as { id: string }[]).map((b) => b.id);
  const { count } = ids.length
    ? await supabase.from("ledger_drafts").select("id", { count: "exact", head: true }).in("book_id", ids).eq("status", "pending")
    : { count: 0 };
  const invited = ((mine ?? []) as { status: string }[]).filter((m) => m.status === "invited").length;
  const waiting = (count ?? 0) + invited;
  const cls = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-card";
  return (
    <>
      <Link href="/books/journal/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        {t("قيدٌ جديد", "New entry")}
      </Link>
      <Link href="/books/review" className={cls}>
        {t("المراجعة", "Review")}
        {waiting > 0 && <span className="ms-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">{waiting}</span>}
      </Link>
      {ids.length > 0 && (
        <>
          <Link href="/books/exceptions" className={cls}>
            {t("الاستثناءات", "Exceptions")}
          </Link>
          <Link href="/books/audit" className={cls}>
            {t("سجلّ التدقيق", "Audit log")}
          </Link>
          <Link href="/books/close" className={cls}>
            {t("إقفال الفترة", "Close the period")}
          </Link>
        </>
      )}
    </>
  );
}

/** The books the page can show, as links that keep the rest of the address. */
export function BookPicker({
  books,
  current,
  base,
  locale,
}: {
  books: Pick<WritableBook, "id" | "kind" | "role" | "owner_name">[];
  current: string | null;
  base: string;
  locale: Locale;
}) {
  if (books.length < 2) return null;
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label={tr(locale, "الدفتر", "Book")}>
      {books.map((b) => (
        <Link
          key={b.id}
          href={`${base}?book=${b.id}`}
          className={`rounded-full border px-3 py-1.5 text-sm ${b.id === current ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}
        >
          {bookLabel(b, locale)}
        </Link>
      ))}
    </nav>
  );
}
