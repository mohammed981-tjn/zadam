import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { explain } from "@/lib/supplyActions";
import { appLocale } from "@/lib/appLocale";

/**
 * صندوق الرسائل في التطبيق (البند ١٤٤): the conversations the caller is in —
 * what /messages shows on the website — and «راسل سوداقري». Row-level security
 * and the database functions decide everything; the bearer token only says who
 * is asking (src/lib/supabase/bearer.ts).
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);

  const { data, error } = await auth.supabase.rpc("my_conversations");
  if (error) return NextResponse.json({ error: explain(locale, error) }, { status: 500 });
  return NextResponse.json({ conversations: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

/** «راسل سوداقري»: the caller's one conversation with the administration. */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);

  const { data, error } = await auth.supabase.rpc("conversation_for_support");
  if (error || !data) return NextResponse.json({ error: explain(locale, error) }, { status: 400 });
  return NextResponse.json({ id: data });
}
