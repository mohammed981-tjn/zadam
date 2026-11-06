import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { formatMoney } from "@/lib/ledger/money";
import { AUDIT_ACTIONS, EXCEPTION_KINDS, VIA, auditSummary } from "@/lib/ledger/journal";
import { tr } from "@/lib/i18n";
import { loadAudit, loadExceptions, readableBook } from "@/lib/ledger/journalLoad";
import { appLocale } from "@/lib/appLocale";

/**
 * سجلّ التدقيق وتقرير الاستثناءات في التطبيق (البند ٢٠٥): /books/audit and /books/exceptions on the website.
 *
 * `?view=audit` (the default) gives a page of the log, newest first (`before` the last id shown); `?view=exceptions`
 * the report, with `backdate` and `drafts` days as on the page. Read as the signed-in person: his own books (or one an
 * administrator's inspection opened), through the same lib/ledger/journalLoad the pages read.
 */

const usd = (n: number | null) => (n === null ? "" : formatMoney(BigInt(Math.round(Number(n))), "USD"));

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const say = (a: string, e: string) => tr(locale, a, e);
  const { supabase, user } = auth;
  const sp = new URL(req.url).searchParams;
  const int = (k: string, d: number, lo: number, hi: number) => {
    const v = sp.get(k);
    const n = v && /^\d+$/.test(v) ? Number(v) : d;
    return Math.min(hi, Math.max(lo, n));
  };
  try {
    const { book, own } = await readableBook(supabase, user.id, sp.get("book"));
    const books = own.map((b) => ({ id: b.id, kind: b.kind }));
    if (!book) return NextResponse.json({ books, book_id: null, rows: [], more: false }, { headers: { "cache-control": "no-store" } });

    if (sp.get("view") === "exceptions") {
      const rows = await loadExceptions(supabase, book.id, {
        backdateDays: int("backdate", 30, 1, 3650),
        draftDays: int("drafts", 7, 0, 365),
      });
      return NextResponse.json(
        {
          books,
          book_id: book.id,
          rows: rows.map((r) => ({
            kind: r.kind,
            title: EXCEPTION_KINDS[r.kind]?.[locale] ?? r.kind,
            hint: (locale === "en" ? EXCEPTION_KINDS[r.kind]?.hint_en : EXCEPTION_KINDS[r.kind]?.hint_ar) ?? "",
            entry_no: r.entry_no,
            date: r.entry_date,
            account: r.account_code,
            amount: usd(r.amount_minor),
            memo: typeof r.detail?.memo === "string" ? r.detail.memo : null,
          })),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const before = sp.get("before");
    const { rows, more } = await loadAudit(supabase, book.id, before && /^\d+$/.test(before) ? Number(before) : null);
    return NextResponse.json(
      {
        books,
        book_id: book.id,
        more,
        rows: rows.map((r) => ({
          id: r.id,
          at: r.at,
          action: AUDIT_ACTIONS[r.action]?.[locale] ?? r.action,
          who: r.actor_id === user.id ? tr(locale, "أنت", "You") : r.actor_name || (r.actor_id ? tr(locale, "مستخدم", "A user") : tr(locale, "النظام", "The system")),
          via: VIA[r.via]?.[locale] ?? r.via,
          detail: auditSummary(r, say),
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app audit: read failed", e);
    return NextResponse.json({ error: tr(locale, "تعذّر تحميل السجلّ الآن. أعد المحاولة بعد قليل.", "Could not load the log just now. Try again shortly.") }, { status: 500 });
  }
}
