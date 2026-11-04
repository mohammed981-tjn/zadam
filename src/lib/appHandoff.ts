import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * تسليم الجلسة من المتصفّح إلى تطبيق الجوّال بعد الدخول بـGoogle (البند ١٧٣).
 *
 * The app cannot run Google's sign-in itself: it opens the phone's browser, and the session ends up in that
 * browser. To bring it back, the website's callback sends the browser to `sudagri://auth?h=…`, which opens the
 * app. Anything in that link could be read by another app that registered the same scheme, so the link carries no
 * session, only a sealed one, and the seal opens only with a secret the app made before it left:
 *
 *   1. The app makes a random `verifier`, keeps it, and sends only its SHA-256 (`challenge`) with the request.
 *   2. The callback seals the session together with that challenge and two minutes' life (AES-256-GCM, with a key
 *      derived from a server-only secret), and puts the sealed text in the link.
 *   3. The app sends the sealed text and the verifier to `/api/app/oauth/finish`; the session comes back only if the
 *      verifier hashes to the challenge inside the seal and the two minutes have not passed.
 *
 * The same shape as OAuth's own PKCE (RFC 7636), one level up. Nothing is stored on the server.
 */

const LIFE_MS = 2 * 60_000;

/** A challenge: base64url of a SHA-256, 43 characters. */
export const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

function key(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHash("sha256").update(`sudagri-app-handoff:${secret}`).digest();
}

export interface HandedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/** The session sealed for the app that sent `challenge`; null when the server has no secret to seal with. */
export function sealSession(session: HandedSession, challenge: string, now = Date.now()): string | null {
  const k = key();
  if (!k || !CHALLENGE.test(challenge)) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = JSON.stringify({ s: session, c: challenge, x: now + LIFE_MS });
  const sealed = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

export type OpenResult = { ok: true; session: HandedSession } | { ok: false; reason: "invalid" | "expired" | "verifier" };

/** The session inside a seal, for the holder of the verifier, within its two minutes. */
export function openSession(sealed: string, verifier: string, now = Date.now()): OpenResult {
  const k = key();
  if (!k || typeof sealed !== "string" || typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) {
    return { ok: false, reason: "invalid" };
  }
  let payload: { s: HandedSession; c: string; x: number };
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return { ok: false, reason: "invalid" };
    const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!(payload.x > now)) return { ok: false, reason: "expired" };
  const want = Buffer.from(payload.c);
  const got = Buffer.from(challengeOf(verifier));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "verifier" };
  return { ok: true, session: payload.s };
}
