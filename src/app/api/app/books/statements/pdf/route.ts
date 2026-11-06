import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { statementsPdfResponse } from "@/lib/ledger/statementsPdfResponse";
import { appLocale } from "@/lib/appLocale";

/**
 * حزمة القوائم الماليّة PDF في التطبيق (البند ٢٠٥): the app's session (bearer), the same query as the website's page, and
 * the same builder as /books/statements/pdf — so the file the phone saves is the file the website gives. The app is in
 * Arabic; `lang=en` asks for the English layout, as does a phone in English (`x-sudagri-lang`, backlog 208).
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const search = new URL(req.url).searchParams;
  // `lang` when the app gives it; otherwise the language the phone is in (backlog 208).
  const lang = search.get("lang");
  return statementsPdfResponse(auth.supabase, auth.user.id, search, lang === "en" || lang === "ar" ? lang : locale);
}
