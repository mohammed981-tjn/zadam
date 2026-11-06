import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { statementsPdfResponse } from "@/lib/ledger/statementsPdfResponse";

/**
 * حزمة القوائم الماليّة PDF على الموقع (البند ٢٠٥): the signed-in reader's session (cookie), the page's own query, the
 * reader's language. The same builder answers the app at /api/app/books/statements/pdf.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  return statementsPdfResponse(supabase, user.id, req.nextUrl.searchParams, await getLocale());
}
