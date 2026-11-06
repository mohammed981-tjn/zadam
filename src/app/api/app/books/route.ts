import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { ledgerToday } from "@/lib/ledger/today";
import { loadReport, pickBook } from "@/lib/ledger/load";
import { bookHeading, PAGE_SIZE, parseReportParams } from "@/lib/ledger/reportParams";
import { linksForApp, reportForApp } from "@/lib/ledger/appReport";
import { reversalAction } from "@/lib/ledgerLinks";
import { loadLinks } from "@/lib/ledgerLinksLoad";

/**
 * «دفتر الحسابات» في التطبيق (البند ٢٠٣): what /books shows on the website, as data.
 *
 * The query is the page's own address (`r`, `book`, `from`, `to`, `as_of`, `a`, `p`), read by the same
 * `parseReportParams`; the book is the same `pickBook` (the reader's own farm or investor book), the report the same
 * `loadReport`, and the partner proposals the same `loadLinks` — all through the app's session, so row-level security
 * and the ledger's functions decide what the reader sees, exactly as on the page.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const today = ledgerToday();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const p = parseReportParams(sp, today);

  const [book, links, fees, own] = await Promise.all([
    pickBook(supabase, p.kind, user.id, p.bookId),
    loadLinks(supabase),
    supabase.rpc("ledger_fees_list"),
    supabase.from("ledger_books").select("kind").eq("owner_id", user.id),
  ]);
  const waitingForMe = links.filter((l) => (l.status === "pending" && !l.mine) || reversalAction(l) === "answer").length;
  const feesWaiting = ((fees.data ?? []) as { status: string; payer_owner: string }[]).filter(
    (f) => f.status === "pending" && f.payer_owner === user.id,
  ).length;
  const kinds = [...new Set(((own.data ?? []) as { kind: string }[]).map((b) => b.kind))].filter((k) => k === "farm" || k === "investor");

  const base = {
    today,
    params: { report: p.report, book: p.kind, from: p.from, to: p.to, as_of: p.asOf, account: p.account, page: p.page, page_size: PAGE_SIZE },
    kinds,
    waiting_for_me: waitingForMe,
    fees_waiting: feesWaiting,
  };

  if (!book && p.bookId) {
    return NextResponse.json(
      { error: "هذا الدفتر ليس مفتوحاً لك: الفحص انتهت مدّته أو أُغلق، أو الرابط لدفترٍ آخر." },
      { status: 404 },
    );
  }

  const heading = book ? bookHeading(book, user.id).ar : null;
  const bookOut = book
    ? { id: book.id, kind: book.kind, heading, closed_through: book.closed_through, owned: book.owner_id === user.id }
    : null;

  if (p.report === "links") {
    return NextResponse.json({ ...base, book: bookOut, report: { kind: "links", ...linksForApp(links) } }, { headers: { "cache-control": "no-store" } });
  }
  if (!book) {
    return NextResponse.json(
      {
        ...base,
        book: null,
        report: null,
        message: "لا دفتر لك بعد. يُفتح دفتر مزرعتك وحده حين تسجّل أوّل مصروف أو إيراد في أحد مواسمك.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const data = await loadReport(supabase, book, { ...p, report: p.report });
    return NextResponse.json(
      { ...base, book: bookOut, report: reportForApp(data, today) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app books report failed", { report: p.report, e });
    return NextResponse.json({ error: "تعذّر تحميل التقرير الآن. أعد المحاولة بعد قليل." }, { status: 500 });
  }
}
