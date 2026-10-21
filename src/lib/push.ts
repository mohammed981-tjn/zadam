import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";

/**
 * تنبيهات الهاتف (البند ١١٩): دفع الإشعار إلى متصفّح المستخدم والموقع مغلق.
 *
 * Web Push through the browser: no app, no SMS bill, no phone number. The
 * VAPID key pair is made once and kept in push_keys, which only the service
 * role reads, so nothing has to be configured and no key ever crosses a chat.
 * Everything here runs with the service-role client, from the daily job.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
}

/** What the browser shows is short; the full text waits on /notifications. */
export const PUSH_BODY_MAX = 160;

export function trimPayload(p: PushPayload): PushPayload {
  const body = p.body.length > PUSH_BODY_MAX ? `${p.body.slice(0, PUSH_BODY_MAX - 1).trimEnd()}…` : p.body;
  return { title: p.title.slice(0, 120), body, url: p.url.startsWith("/") ? p.url : "/notifications" };
}

type Admin = SupabaseClient;

/** The key pair, generated and stored on first use. */
export async function ensureVapidKeys(admin: Admin): Promise<{ publicKey: string; privateKey: string } | null> {
  const { data, error } = await admin.from("push_keys").select("public_key, private_key").eq("one", true).maybeSingle();
  if (error) {
    console.error("push: keys", error);
    return null;
  }
  if (data) return { publicKey: data.public_key as string, privateKey: data.private_key as string };

  const fresh = webpush.generateVAPIDKeys();
  // Two jobs racing on first use: the loser's insert conflicts and the winner's pair is reread.
  const { error: insertError } = await admin.from("push_keys").insert({ one: true, public_key: fresh.publicKey, private_key: fresh.privateKey });
  if (insertError) {
    const again = await admin.from("push_keys").select("public_key, private_key").eq("one", true).maybeSingle();
    if (again.data) return { publicKey: again.data.public_key as string, privateKey: again.data.private_key as string };
    console.error("push: could not store keys", insertError);
    return null;
  }
  return fresh;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends one payload to every working subscription of a user. A browser that
 * answers 404 or 410 has dropped the subscription: it is marked failed and
 * kept, never deleted. Returns what happened, for the job's report.
 */
export async function pushToUser(admin: Admin, userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .is("failed_at", null);
  if (error || !subs || subs.length === 0) {
    if (error) console.error("push: subscriptions", error);
    return { sent: 0, failed: 0 };
  }
  const keys = await ensureVapidKeys(admin);
  if (!keys) return { sent: 0, failed: subs.length };
  webpush.setVapidDetails(SITE_URL, keys.publicKey, keys.privateKey);

  const body = JSON.stringify(trimPayload(payload));
  let sent = 0;
  let failed = 0;
  for (const s of subs as SubscriptionRow[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86_400 });
      sent++;
      await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").update({ failed_at: new Date().toISOString(), failed_note: `المتصفّح أسقط الاشتراك (${status})` }).eq("id", s.id);
      } else {
        console.error("push: send failed", status, (e as Error).message);
      }
    }
  }
  return { sent, failed };
}
