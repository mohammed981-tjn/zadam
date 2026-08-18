import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * حيث تهبط روابط البريد — وكانت غائبة.
 *
 * Every link Supabase mails — confirm your address, reset your password —
 * bounces off Supabase's own verify endpoint and lands back here carrying a
 * one-time credential. Something has to trade that credential for a session
 * cookie. Nothing did: there was no route under /auth anywhere in the app and
 * neither exchangeCodeForSession nor verifyOtp was called from a single line of
 * it.
 *
 * So the reset flow was a door with no key. The mail arrived, the link opened,
 * /reset/confirm asked whether anyone was signed in, found nobody, and said the
 * link had expired — which was true in effect and misleading in substance,
 * because the link was fine and the application simply had nowhere to put it.
 *
 * TWO SHAPES, BOTH HANDLED
 *
 * Supabase sends one of two things depending on the project's email templates,
 * and which one is in use is not visible from the code:
 *
 *   ?code=…                     the PKCE flow. Exchanged for a session, but only
 *                               in the browser that made the request, because
 *                               the verifier lives in a cookie there.
 *
 *   ?token_hash=…&type=recovery the OTP flow. Verified without a verifier, so it
 *                               survives being opened in a different browser —
 *                               which is what actually happens when someone
 *                               reads their mail on a phone and requested the
 *                               reset on a laptop.
 *
 * Both are accepted rather than guessing. The second is the one to prefer, and
 * choosing it is a Supabase template setting rather than a code change: point
 * the template at {{ .TokenHash }}.
 */

/** Where the visitor is sent afterwards, per link type, when none is given. */
const DEFAULT_NEXT: Record<string, string> = {
  recovery: "/reset/confirm",
  signup: "/login?method=email&message=" + encodeURIComponent("تم تفعيل بريدك. سجّل الدخول الآن."),
  email: "/login?method=email&message=" + encodeURIComponent("تم تأكيد بريدك."),
  invite: "/reset/confirm",
  magiclink: "/dashboard",
  email_change: "/dashboard",
};

/**
 * Only same-origin relative paths are followed.
 *
 * `next` arrives in a URL anyone can craft and hand to a victim, so an
 * unchecked redirect here would let a link that genuinely comes from our domain
 * deposit someone on a site of the attacker's choosing, already signed in.
 * Requiring a leading "/" and rejecting "//" — which browsers read as
 * protocol-relative and therefore as another host — keeps every destination
 * inside this application.
 */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  // Must be a path on this site.
  if (!value.startsWith("/")) return null;
  // "//host" is protocol-relative — another origin wearing a leading slash.
  if (value.startsWith("//")) return null;
  /*
   * Backslashes are rejected outright rather than inspected.
   *
   * Browsers normalise "\" to "/" in URLs, so "/\evil.com" is read as
   * "//evil.com" — the check above passes it and the browser leaves the site
   * anyway. This is the standard way an open redirect survives a check that
   * only looked at the first two characters.
   */
  if (value.includes("\\")) return null;
  return value;
}

function failure(origin: string, reason: string) {
  return NextResponse.redirect(
    `${origin}/reset?error=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "";
  const next = safeNext(searchParams.get("next"));

  /*
   * Supabase reports its own refusals here rather than in the exchange, and
   * they are the common case: a link opened twice, or opened after it aged out.
   * Reading them first means the visitor is told what happened instead of
   * getting a generic failure from a call that was never going to succeed.
   */
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return failure(
      origin,
      "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.",
    );
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth/callback: code exchange failed:", error.message);
      return failure(
        origin,
        // Named precisely, because this failure has a cause a visitor can act
        // on: the PKCE verifier lives in the browser that asked for the link.
        "تعذّر إكمال الرابط. افتحه في نفس المتصفح الذي طلبته منه، أو اطلب رابطاً جديداً.",
      );
    }
    return NextResponse.redirect(
      `${origin}${next ?? DEFAULT_NEXT[type] ?? "/dashboard"}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) {
      console.error("auth/callback: verifyOtp failed:", error.message);
      return failure(
        origin,
        "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.",
      );
    }
    return NextResponse.redirect(
      `${origin}${next ?? DEFAULT_NEXT[type] ?? "/dashboard"}`,
    );
  }

  /*
   * Neither shape present.
   *
   * The remaining possibility is the implicit flow, which returns the tokens in
   * the URL fragment — and a fragment never reaches the server, so no route
   * handler can see it. Rather than fail silently, the visitor is sent to a page
   * that can read it in the browser.
   */
  return NextResponse.redirect(`${origin}/auth/callback/fragment`);
}
