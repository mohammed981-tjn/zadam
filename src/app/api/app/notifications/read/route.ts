import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";

/**
 * «علّم الكلّ مقروءاً» من التطبيق (البند ١٣٨) — what markNotificationsRead does
 * on the website (src/app/notifications/actions.ts), with no ownership check
 * written here for the same reason given there: row-level security restricts
 * the update to the caller's own rows, and a trigger refuses any change to a
 * column but read_at.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  const { error } = await auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) return NextResponse.json({ error: "تعذّر تعليمها مقروءة. أعد المحاولة." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
