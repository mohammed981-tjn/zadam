import { createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trimPayload } from "@/lib/push";

/**
 * إشعارات الجوّال والتطبيق مغلق (البند ٢٠٧): كلّ صفٍّ يُكتب في `notifications` يصل إلى تطبيق سوداقري عبر Firebase
 * Cloud Messaging (FCM HTTP v1).
 *
 * WHERE THE KEY LIVES
 *
 * FCM v1 is called with a Google service account. Its JSON is held in one server environment variable,
 * FCM_SERVICE_ACCOUNT, set by the owner in Vercel (docs/push-setup-ar.md) — never in the repository, never in the
 * app, never with a NEXT_PUBLIC_ prefix (scripts/verify-push.ts holds all three). Nothing here runs in a browser.
 * Without the variable the sender does nothing, says so once in the log, and claims nothing: the notifications stay
 * in the inbox, where they always were.
 *
 * WHAT GOES IN A PUSH
 *
 * The notification's own title and body (as /notifications shows them, trimmed) and the in-app path to open — the
 * same words already on the inbox, nothing read from anywhere else. Android is asked to keep it PRIVATE on a locked
 * screen: the phone's own setting decides whether its text shows there.
 *
 * ONCE, AND ONLY ONCE
 *
 * The database hands each notification out once (push_claim marks pushed_at in the same statement, SKIP LOCKED), so
 * two senders running together — the bell from pg_net and the daily job — never send the same one twice. A token
 * FCM calls unregistered (the app was removed, or the phone signed out) is deleted.
 */

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
/** One FCM call may take this long before it is given up on. */
const SEND_TIMEOUT_MS = 8_000;
/** Phones asked at once. */
const PARALLEL = 10;
/** Notifications claimed per round. */
const CLAIM = 100;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

/**
 * The service account from FCM_SERVICE_ACCOUNT: the JSON file Google gives, pasted as it is (or base64 of it, for a
 * dashboard that mangles newlines). Null when it is missing or is not a service account.
 */
export function readServiceAccount(raw: string | undefined = process.env.FCM_SERVICE_ACCOUNT): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const j = json as Record<string, unknown>;
  const privateKey = typeof j.private_key === "string" ? j.private_key.replace(/\\n/g, "\n") : "";
  if (
    typeof j.project_id !== "string" || !/^[a-z0-9-]{4,40}$/.test(j.project_id) ||
    typeof j.client_email !== "string" || !j.client_email.includes("@") ||
    !privateKey.includes("PRIVATE KEY")
  ) {
    return null;
  }
  const tokenUri = typeof j.token_uri === "string" && j.token_uri.startsWith("https://") ? j.token_uri : DEFAULT_TOKEN_URI;
  return { projectId: j.project_id, clientEmail: j.client_email, privateKey, tokenUri };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The signed assertion Google exchanges for an access token (RFC 7523). */
export function signedAssertion(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: sa.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${b64url(signer.sign(sa.privateKey))}`;
}

type Fetch = typeof fetch;
let cached: { key: string; token: string; until: number } | null = null;

async function accessToken(sa: ServiceAccount, fetchImpl: Fetch): Promise<string | null> {
  const key = `${sa.projectId}:${sa.clientEmail}`;
  if (cached && cached.key === key && cached.until > Date.now()) return cached.token;
  try {
    const res = await fetchImpl(sa.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedAssertion(sa) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) {
      console.error("push: Google refused the service account", res.status, body.error ?? "");
      return null;
    }
    cached = { key, token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 300) * 1000 };
    return body.access_token;
  } catch (e) {
    console.error("push: could not reach Google for a token", (e as Error).message);
    return null;
  }
}

/** One row push_claim hands out: a notification, for one phone. */
export interface PushSend {
  id: string;
  token: string;
  locale: string;
  title: string;
  body: string;
  link: string | null;
}

/** The FCM v1 message for one phone: the notification's own words and the path to open, nothing else. */
export function fcmMessage(s: PushSend) {
  const p = trimPayload({ title: s.title || "سوداقري", body: s.body, url: s.link ?? "/notifications" });
  return {
    message: {
      token: s.token,
      notification: { title: p.title, body: p.body },
      data: { link: p.url, notification_id: s.id },
      android: {
        priority: "HIGH",
        ttl: "86400s",
        notification: { visibility: "PRIVATE", tag: s.id },
      },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };
}

type Outcome = "sent" | "gone" | "expired" | "failed";

/** FCM's answer, read for what it means here: delivered, a dead token, a stale access token, or anything else. */
export function readOutcome(status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 401) return "expired";
  const details = ((body as { error?: { details?: { errorCode?: string }[] } })?.error?.details ?? []).map((d) => d.errorCode);
  // UNREGISTERED: the app was removed or the token was deleted. SENDER_ID_MISMATCH: a token of another Firebase project.
  if (status === 404 || details.includes("UNREGISTERED") || details.includes("SENDER_ID_MISMATCH")) return "gone";
  return "failed";
}

async function sendOne(sa: ServiceAccount, token: string, s: PushSend, fetchImpl: Fetch): Promise<Outcome> {
  try {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(fcmMessage(s)),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const outcome = readOutcome(res.status, await res.json().catch(() => null));
    if (outcome === "failed") console.error("push: FCM send failed", res.status);
    return outcome;
  } catch (e) {
    console.error("push: FCM send failed", (e as Error).message);
    return "failed";
  }
}

let warnedOff = false;

export interface DispatchResult {
  /** True when FCM_SERVICE_ACCOUNT is not set (or not a service account): nothing was claimed or sent. */
  off: boolean;
  claimed: number;
  sent: number;
  failed: number;
  dropped: number;
}

/**
 * Sends what the notifications table holds and no phone has had yet. Called by /api/push/dispatch (the database's
 * bell, right after a notification is written) and by the daily job (whatever the bell missed). [admin] is the
 * service-role client: push_claim is closed to everyone else.
 */
export async function dispatchPushes(
  admin: SupabaseClient,
  opts: { raw?: string; fetchImpl?: Fetch; budgetMs?: number } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { off: false, claimed: 0, sent: 0, failed: 0, dropped: 0 };
  const sa = readServiceAccount("raw" in opts ? opts.raw : process.env.FCM_SERVICE_ACCOUNT);
  if (!sa) {
    if (!warnedOff) {
      warnedOff = true;
      console.warn("push: FCM_SERVICE_ACCOUNT is not set — phone notifications are off (docs/push-setup-ar.md).");
    }
    return { ...result, off: true };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);

  // The access token first: a key Google refuses must not cost the notifications their one turn.
  let token = await accessToken(sa, fetchImpl);
  if (!token) return result;

  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("push_claim", { p_limit: CLAIM });
    if (error) {
      console.error("push: claim", error.message);
      break;
    }
    const claimed = Number((data as { claimed?: number } | null)?.claimed ?? 0);
    const sends = ((data as { sends?: PushSend[] } | null)?.sends ?? []) as PushSend[];
    result.claimed += claimed;

    const gone: string[] = [];
    const reached: string[] = [];
    for (let i = 0; i < sends.length; i += PARALLEL) {
      const batch = sends.slice(i, i + PARALLEL);
      const outcomes = await Promise.all(batch.map((s) => sendOne(sa, token as string, s, fetchImpl)));
      // An access token that expired mid-run: one new one, and the refused sends once more.
      if (outcomes.includes("expired")) {
        cached = null;
        const again = await accessToken(sa, fetchImpl);
        if (again) {
          token = again;
          for (let k = 0; k < batch.length; k++) {
            if (outcomes[k] === "expired") outcomes[k] = await sendOne(sa, again, batch[k], fetchImpl);
          }
        }
      }
      outcomes.forEach((o, k) => {
        if (o === "sent") {
          result.sent++;
          reached.push(batch[k].token);
        } else if (o === "gone") {
          result.dropped++;
          gone.push(batch[k].token);
        } else {
          result.failed++;
        }
      });
    }
    if (gone.length > 0) {
      const { error: dropError } = await admin.from("push_devices").delete().in("token", [...new Set(gone)]);
      if (dropError) console.error("push: drop tokens", dropError.message);
    }
    if (reached.length > 0) {
      await admin.from("push_devices").update({ last_sent_at: new Date().toISOString() }).in("token", [...new Set(reached)]);
    }
    if (claimed < CLAIM) break;
  }
  return result;
}

/** For the static gate: the one-time warning, as if the process had just started. */
export function _resetForTests() {
  warnedOff = false;
  cached = null;
}
