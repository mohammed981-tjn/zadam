import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { statementsPdfResponse } from "@/lib/ledger/statementsPdfResponse";

/**
 * حزمة القوائم الماليّة PDF في التطبيق (البند ٢٠٥): the app's session (bearer), the same query as the website's page, and
 * the same builder as /books/statements/pdf — so the file the phone saves is the file the website gives. The app is in
 * Arabic; `lang=en` asks for the English layout.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const search = new URL(req.url).searchParams;
  return statementsPdfResponse(auth.supabase, auth.user.id, search, search.get("lang") === "en" ? "en" : "ar");
}
