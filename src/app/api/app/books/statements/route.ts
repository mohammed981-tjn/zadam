import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { ledgerToday } from "@/lib/ledger/today";
import { pickBook } from "@/lib/ledger/load";
import { parseStatementsParams } from "@/lib/ledger/statementsParams";
import { loadStatements, seasonOptions } from "@/lib/ledger/statementsLoad";
import { statementsForApp } from "@/lib/ledger/statementsApp";

/**
 * «القوائم الماليّة» في التطبيق (البند ٢٠٥): what /books/statements shows on the website, as data.
 *
 * The query is the page's own (`book`, `id`, `basis`, `y`, `m`, `s`, `compare`), read by the same parser; the bundle is
 * the same `loadStatements`, through the app's session, so the database's functions decide whether the reader may read
 * the book exactly as on the website. Money is in cents (whole numbers); the app formats it. `pdf` is the address of
 * the same bundle as a PDF, fetched with the same bearer token.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const today = ledgerToday();
  const p = parseStatementsParams(Object.fromEntries(new URL(req.url).searchParams.entries()), today);
  const book = await pickBook(supabase, p.kind, user.id, p.bookId);
  if (!book) {
    return NextResponse.json(
      {
        error: p.bookId
          ? "هذا الدفتر ليس مفتوحاً لك: الفحص انتهت مدّته أو أُغلق، أو الرابط لدفترٍ آخر."
          : "لا دفتر لك بعد. يُفتح دفتر مزرعتك وحده حين تسجّل أوّل مصروف أو إيراد في أحد مواسمك.",
      },
      { status: 404 },
    );
  }

  try {
    const [bundle, seasons] = await Promise.all([loadStatements(supabase, book, p, today, user.id), seasonOptions(supabase, book)]);
    return NextResponse.json(statementsForApp(bundle, p, seasons, today), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("app statements failed", { basis: p.basis, e });
    return NextResponse.json({ error: "تعذّر تحميل القوائم الآن. أعد المحاولة بعد قليل." }, { status: 500 });
  }
}
