import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ledgerToday } from "@/lib/ledger/today";
import { loadReport, pickBook } from "@/lib/ledger/load";
import { parseReportParams } from "@/lib/ledger/reportParams";
import { reportToCsv } from "@/lib/ledger/reportData";

/**
 * تصدير تقرير الدفتر ملف CSV (البند ١٨٧ ٢د). Reads as the signed-in person, so the policy that
 * decides what the page shows decides what the file holds; nobody is signed in, nothing is sent.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });

  const today = ledgerToday();
  const params = parseReportParams(Object.fromEntries(req.nextUrl.searchParams.entries()), today);
  const book = await pickBook(supabase, params.kind);
  if (!book) return new NextResponse("No book", { status: 404 });

  let csv: string;
  try {
    csv = reportToCsv(await loadReport(supabase, book, params));
  } catch (e) {
    console.error("books export failed", { report: params.report, e });
    return new NextResponse("The report could not be loaded", { status: 500 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sudagri-${params.report}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
