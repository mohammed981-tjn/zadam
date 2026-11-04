import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { homeFor, safeNext } from "@/lib/authEntry";
import { CHALLENGE, sealSession } from "@/lib/appHandoff";

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
const defaultNext = (locale: Locale): Record<string, string> => ({
  recovery: "/reset/confirm",
  signup: "/login?method=email&message=" + encodeURIComponent(tr(locale, "تم تفعيل بريدك. سجّل الدخول الآن.", "Your email is confirmed. Sign in now.")),
  email: "/login?method=email&message=" + encodeURIComponent(tr(locale, "تم تأكيد بريدك.", "Your email is confirmed.")),
  invite: "/reset/confirm",
  magiclink: "/dashboard",
  email_change: "/dashboard",
});

/*
 * Only same-origin relative paths are followed: `next` arrives in a URL anyone can craft and hand to a victim, so an
 * unchecked redirect here would deposit someone, already signed in, on a site of the attacker's choosing. The check is
 * the sign-in screen's own (`safeNext` in @/lib/authEntry), so the two cannot drift apart again: this one refused "\"
 * and that one only "/\" at the start, and neither refused the tab the browser silently drops (audit 3 November 2026).
 */

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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const DEFAULT_NEXT = defaultNext(locale);

  /*
   * Supabase reports its own refusals here rather than in the exchange, and
   * they are the common case: a link opened twice, or opened after it aged out.
   * Reading them first means the visitor is told what happened instead of
   * getting a generic failure from a call that was never going to succeed.
   */
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  // Back from Google or Facebook (backlog 153): their refusals are not about a
  // mailed link, so they go to the sign-in screen with words that fit.
  const via = searchParams.get("via");
  if (via && (providerError || !code)) {
    if (providerError) console.error("auth/callback: provider refused:", via, providerError);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        t(
          "لم يكتمل الدخول بهذا الحساب. جرّب مرّةً أخرى، أو ادخل برقم جوالك أو بريدك.",
          "Signing in with that account did not finish. Try again, or sign in with your mobile number or email.",
        ),
      )}`,
    );
  }
  if (providerError) {
    return failure(
      origin,
      t(
        "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.",
        "The link has expired or has already been used. Request a new one.",
      ),
    );
  }

  const supabase = await createClient();

  if (code) {
    const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error && via) {
      console.error("auth/callback: provider code exchange failed:", via, error.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          t(
            "لم يكتمل الدخول بهذا الحساب. افتح الصفحة في المتصفّح نفسه وجرّب مرّةً أخرى.",
            "Signing in with that account did not finish. Open the page in the same browser and try again.",
          ),
        )}`,
      );
    }
    if (error) {
      console.error("auth/callback: code exchange failed:", error.message);
      return failure(
        origin,
        // Named precisely, because this failure has a cause a visitor can act
        // on: the PKCE verifier lives in the browser that asked for the link.
        t(
          "تعذّر إكمال الرابط. افتحه في نفس المتصفح الذي طلبته منه، أو اطلب رابطاً جديداً.",
          "The link could not be completed. Open it in the same browser you requested it from, or request a new one.",
        ),
      );
    }
    if (via && exchanged.user) {
      // A first sign-in with Google or Facebook made the account just now,
      // with the default side; the side chosen on the screen is set here
      // (one account does both — backlog 151 — so this only picks the home).
      const side = searchParams.get("side") === "investor" ? "investor" : "farmer";
      const made = new Date(exchanged.user.created_at).getTime();
      if (Date.now() - made < 10 * 60_000) {
        await supabase.from("profiles").update({ role: side }).eq("id", exchanged.user.id).in("role", ["farmer", "investor"]);
      }
      // Started from the phone app (backlog 173): the session goes back to the app sealed, openable only with the
      // secret the app kept (lib/appHandoff), and the browser is done.
      const challenge = searchParams.get("app");
      if (challenge !== null) {
        const s = exchanged.session;
        const sealed =
          s && CHALLENGE.test(challenge)
            ? sealSession(
                {
                  access_token: s.access_token,
                  refresh_token: s.refresh_token,
                  expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
                },
                challenge,
              )
            : null;
        if (!sealed) {
          console.error("auth/callback: could not seal the session for the app");
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(
              t("لم يكتمل الدخول إلى التطبيق. جرّب مرّةً أخرى.", "Signing in to the app did not finish. Try again."),
            )}`,
          );
        }
        return NextResponse.redirect(`sudagri://auth?h=${sealed}`);
      }
      return NextResponse.redirect(`${origin}${next ?? (await homeFor(supabase, exchanged.user.id))}`);
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
        t(
          "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.",
          "The link has expired or has already been used. Request a new one.",
        ),
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
