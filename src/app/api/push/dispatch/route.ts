import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatches } from "@/lib/cronAuth";
import { dispatchPushes } from "@/lib/fcm";

/**
 * المُرسِل (البند ٢٠٧): يدفع إلى جوّالات التطبيق ما كُتب في `notifications` ولم يصلها بعد.
 *
 * WHO CALLS IT
 *
 * The database, right after a notification is written to someone with a registered phone (the bell in
 * 20261106090000_push_devices.sql, through pg_net), carrying the secret the migration generated and keeps in
 * push_hook — readable by the service role alone. Or a person or job holding CRON_SECRET, by hand. Anyone else is
 * refused: behind this door is the service-role client.
 *
 * Without FCM_SERVICE_ACCOUNT it answers `off` and touches nothing (lib/fcm).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "الإرسال غير مهيّأ على هذا النشر." }, { status: 503 });

  const header = req.headers.get("authorization");
  const cron = process.env.CRON_SECRET;
  let allowed = Boolean(cron) && bearerMatches(header, cron as string);
  if (!allowed && header) {
    const { data } = await admin.from("push_hook").select("secret").eq("one", true).maybeSingle();
    const secret = (data as { secret?: string } | null)?.secret;
    allowed = Boolean(secret) && bearerMatches(header, secret as string);
  }
  if (!allowed) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const result = await dispatchPushes(admin);
  return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}

export { handle as GET, handle as POST };
