/**
 * الردّ بحزمة القوائم PDF (البند ٢٠٥): one answer for both doors — the website's route reads the cookie session, the
 * app's reads the bearer token — so the two files are built by the same code from the same figures. The reader's own
 * client goes all the way down: the database's functions decide whether this person may read this book.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "../i18n";
import { pickBook } from "./load";
import { parseStatementsParams } from "./statementsParams";
import { loadStatements } from "./statementsLoad";
import { buildStatementsPdf, statementsFileName } from "./statementsPdf";
import { ledgerToday } from "./today";

export async function statementsPdfResponse(
  supabase: SupabaseClient,
  me: string,
  search: URLSearchParams,
  locale: Locale,
): Promise<Response> {
  const today = ledgerToday();
  const p = parseStatementsParams(Object.fromEntries(search.entries()), today);
  const book = await pickBook(supabase, p.kind, me, p.bookId);
  if (!book) {
    return Response.json(
      { error: locale === "en" ? "No book is open to you here." : "لا دفتر مفتوحاً لك هنا." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const bundle = await loadStatements(supabase, book, p, today, me);
    const bytes = await buildStatementsPdf(bundle, { locale });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${statementsFileName(bundle)}"`,
        "Cache-Control": "no-store",
        // The fingerprint travels with the file, for a client that shows it beside the saved file.
        "X-Statements-Fingerprint": bundle.fingerprint,
      },
    });
  } catch (e) {
    console.error("statements pdf failed", { basis: p.basis, e });
    return Response.json(
      { error: locale === "en" ? "The bundle could not be made just now. Try again shortly." : "تعذّر إعداد الحزمة الآن. أعد المحاولة بعد قليل." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
